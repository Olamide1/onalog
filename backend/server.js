import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import searchRoutes from './routes/search.js';
import leadRoutes from './routes/leads.js';
import exportRoutes from './routes/export.js';
import authRoutes from './routes/auth.js';
import companyRoutes from './routes/company.js';
import billingRoutes from './routes/billing.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [process.env.CORS_ORIGIN || 'http://localhost:5173', 'https://coralgen.netlify.app'],
  credentials: true,
  maxAge: 86400,
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/billing', billingRoutes);

// Health check - responds even if DB not connected (for deployment health checks)
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ 
    status: 'ok', 
    database: dbStatus,
    timestamp: new Date().toISOString() 
  });
});

// a hi response in base route
app.get('/', (req, res) => {
  res.json({ message: 'hi', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// MongoDB connection with timeout and retry logic
const connectDB = async () => {
  const maxRetries = 5;
  const retryDelay = 5000; // 5 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/onalog';
      
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 10000, // 10 second timeout
        socketTimeoutMS: 45000, // 45 second socket timeout
        connectTimeoutMS: 10000, // 10 second connection timeout
      });
      
      console.log('✅ MongoDB connected');
      return true;
    } catch (err) {
      console.error(`❌ MongoDB connection error (attempt ${attempt}/${maxRetries}):`, err.message);
      
      if (attempt === maxRetries) {
        console.error('❌ Failed to connect to MongoDB after all retries');
        // Don't exit - let server start anyway for health checks
        return false;
      }
      
      console.log(`⏳ Retrying in ${retryDelay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  return false;
};

// Start server only after MongoDB connection attempt
const startServer = async () => {
  // Attempt to connect to MongoDB (but don't block server startup)
  await connectDB();
  
  // Start server with error handling
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    if (mongoose.connection.readyState !== 1) {
      console.warn('⚠️  Server started but MongoDB connection pending - some features may not work');
    }
  });
  
  // Handle port already in use error
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use.`);
      console.log(`💡 Try one of these solutions:`);
      console.log(`   1. Kill the process: lsof -ti:3000 | xargs kill -9`);
      console.log(`   2. Use a different port: PORT=3001 npm run dev`);
      process.exit(1);
    } else {
      throw err;
    }
  });
  
  // Graceful shutdown handlers
  let isShuttingDown = false;
  let shutdownTimeout = null;
  
  const gracefulShutdown = async (signal) => {
    // Guard against concurrent shutdown attempts
    if (isShuttingDown) {
      console.log(`⚠️  ${signal} received but shutdown already in progress, ignoring...`);
      return;
    }
    
    isShuttingDown = true;
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    
    server.close(() => {
      console.log('✅ HTTP server closed');
      
      mongoose.connection.close(false, () => {
        console.log('✅ MongoDB connection closed');
        if (shutdownTimeout) {
          clearTimeout(shutdownTimeout);
        }
        process.exit(0);
      });
    });
    
    // Force close after 10 seconds
    shutdownTimeout = setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };
  
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  return server;
};

// Start the application
startServer().catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
