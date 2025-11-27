# Deployment Guide for Onalog Backend

## Issues Fixed

1. ✅ Added Node.js engine specification (20.x)
2. ✅ Updated Procfile to use npm instead of yarn
3. ✅ Added Puppeteer configuration for deployment environments
4. ✅ Created Render configuration file

---

## Heroku Deployment

### Prerequisites
- Heroku CLI installed
- Git repository initialized

### Steps

1. **Create Heroku App**
   ```bash
   heroku create your-app-name
   ```

2. **Add Puppeteer Buildpacks** (IMPORTANT!)
   ```bash
   heroku buildpacks:add --index 1 https://github.com/jontewks/puppeteer-heroku-buildpack
   heroku buildpacks:add --index 2 heroku/nodejs
   ```

3. **Set Environment Variables**
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set MONGODB_URI=your_mongodb_connection_string
   heroku config:set JWT_SECRET=your_jwt_secret
   heroku config:set CORS_ORIGIN=your_frontend_url
   # Add other required environment variables
   ```

4. **Deploy from Subtree** (since backend is in a subdirectory)
   ```bash
   cd /Users/chuks/Documents/onalog
   git subtree push --prefix backend heroku main
   ```
   
   Or if you're already in the backend directory:
   ```bash
   cd ..
   git subtree push --prefix backend heroku main
   ```

5. **Check Logs**
   ```bash
   heroku logs --tail
   ```

### Alternative: Deploy Backend Only Repository

If you want to deploy backend as its own repo:

1. Create a new repo with just the backend code
2. Push to Heroku directly:
   ```bash
   git push heroku main
   ```

---

## Render Deployment

### Steps

1. **Connect GitHub Repository**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure Service**
   - **Name**: onalog-backend
   - **Root Directory**: `backend` (if deploying from monorepo)
   - **Environment**: Node
   - **Region**: Choose closest to your users
   - **Branch**: main
   - **Build Command**: `yarn install`
   - **Start Command**: `yarn start`

3. **Add Environment Variables**
   Go to "Environment" tab and add:
   ```
   NODE_ENV=production
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   CORS_ORIGIN=your_frontend_url
   PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
   PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
   ```

4. **Install Chrome on Render**
   Add a `render-build.sh` file (optional, or add to package.json):
   ```bash
   #!/bin/bash
   yarn install
   apt-get update && apt-get install -y chromium-browser
   ```

5. **Deploy**
   - Click "Create Web Service"
   - Render will automatically deploy on every push to main branch

---

## Railway Deployment (Alternative)

Railway is another great option that handles Puppeteer better:

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login and Deploy**
   ```bash
   cd backend
   railway login
   railway init
   railway up
   ```
   
   Or link existing project:
   ```bash
   railway link
   railway up
   ```

3. **Set Environment Variables**
   ```bash
   railway variables set NODE_ENV=production
   railway variables set MONGODB_URI=your_mongodb_connection_string
   # ... other variables
   ```

---

## Puppeteer Considerations

The app uses Puppeteer for web scraping, which requires:

1. **Chrome/Chromium browser** installed on the server
2. **Additional system dependencies** (fonts, libraries)
3. **Sufficient memory** (at least 512MB, recommended 1GB+)

### If Puppeteer fails:
- Check if Chrome is installed in the deployment environment
- Verify `PUPPETEER_EXECUTABLE_PATH` is set correctly
- Consider using puppeteer-core with @sparticuz/chromium for serverless
- Check memory limits (Puppeteer needs adequate RAM)

---

## Troubleshooting

### Build Fails
- Check Node version matches package.json engines
- Verify all dependencies are in package.json (not devDependencies)
- Check build logs for specific errors

### Puppeteer Crashes
- Increase memory allocation
- Add more Chromium flags: `--disable-dev-shm-usage`, `--single-process`
- Consider using puppeteer alternatives or external scraping services

### Database Connection Issues
- Verify MONGODB_URI is correctly set
- Check MongoDB Atlas allows connections from hosting IP
- Test connection string locally first

### Port Issues
- Ensure app uses `process.env.PORT`
- Don't hardcode port numbers
- Check server.js line 15: `const PORT = process.env.PORT || 3000;`

---

## Environment Variables Required

```env
NODE_ENV=production
PORT=3000 (automatically set by most platforms)
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your_secure_secret
CORS_ORIGIN=https://your-frontend.com
OPENAI_API_KEY=sk-... (if using AI features)
```

---

## Performance Tips

1. Use MongoDB connection pooling
2. Enable compression middleware
3. Add rate limiting for API endpoints
4. Consider caching for frequently accessed data
5. Monitor memory usage (especially with Puppeteer)

---

## Support

If deployment still fails:
1. Check platform-specific logs
2. Verify all environment variables
3. Test locally with `NODE_ENV=production yarn start`
4. Consider using Docker for consistent environments

