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

// MongoDB connection with timeout and retry logic (non-blocking)
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

// Start server immediately (non-blocking MongoDB connection)
const startServer = () => {
  let server;
  
  try {
    // Start server immediately for fast health checks
    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log('⏳ Connecting to MongoDB in background...');
    });
  } catch (err) {
    // Catch synchronous errors from app.listen() (e.g., invalid port)
    console.error('❌ Failed to start HTTP server:', err.message);
    throw err; // Re-throw to be caught by outer handler
  }
  
  // Connect to MongoDB in background (non-blocking)
  // Note: MongoDB connection failures don't cause process exit - server continues running
  connectDB().then(connected => {
    if (connected) {
      console.log('✅ MongoDB connection established');
    } else {
      console.warn('⚠️  MongoDB connection failed - server running but database features may not work');
    }
  }).catch(err => {
    // MongoDB connection errors are logged but don't exit the process
    console.error('❌ MongoDB connection error:', err.message);
    console.warn('⚠️  Server continues running without database connection');
  });
  
  // Handle port already in use error (asynchronous)
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use.`);
      console.log(`💡 Try one of these solutions:`);
      console.log(`   1. Kill the process: lsof -ti:3000 | xargs kill -9`);
      console.log(`   2. Use a different port: PORT=3001 npm run dev`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', err.message);
      process.exit(1);
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

// Start the application immediately
// Catches synchronous errors from startServer() (e.g., invalid port, app.listen() throws)
try {
  startServer();
} catch (err) {
  console.error('❌ Failed to start server:', err.message);
  process.exit(1);
}
