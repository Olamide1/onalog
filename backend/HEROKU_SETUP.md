# Quick Heroku Setup Guide

## Root Cause of Deployment Failure

The logs showed: `/bin/bash: line 1: npm: command not found`

**Issues Fixed:**
1. ✅ Procfile was using `npm start` but project uses yarn
2. ✅ Missing Node.js version in engines
3. ✅ Puppeteer not configured for deployment

---

## Quick Fix Steps

### 1. Add Puppeteer Buildpack (CRITICAL!)

```bash
# If you haven't created the Heroku app yet:
heroku create your-app-name

# Add buildpacks in this specific order:
heroku buildpacks:clear
heroku buildpacks:add --index 1 https://github.com/jontewks/puppeteer-heroku-buildpack
heroku buildpacks:add --index 2 heroku/nodejs

# Verify buildpacks are set:
heroku buildpacks
```

Expected output:
```
=== your-app-name Buildpack URLs
1. https://github.com/jontewks/puppeteer-heroku-buildpack
2. heroku/nodejs
```

### 2. Set Required Environment Variables

```bash
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI="your_mongodb_connection_string"
heroku config:set JWT_SECRET="your_jwt_secret_key"
heroku config:set CORS_ORIGIN="https://your-frontend-url.netlify.app"
heroku config:set OPENAI_API_KEY="your_openai_key" # if applicable

# Verify:
heroku config
```

### 3. Deploy from Monorepo

Since backend is in a subdirectory, use git subtree:

```bash
# From the root directory (/Users/chuks/Documents/onalog):
git subtree push --prefix backend heroku main
```

If you get errors, try force push:
```bash
git push heroku `git subtree split --prefix backend main`:main --force
```

### 4. Check Deployment

```bash
# Watch logs in real-time:
heroku logs --tail

# Check app status:
heroku ps

# Open app in browser:
heroku open
```

### 5. Test the API

```bash
# Health check:
curl https://your-app-name.herokuapp.com/api/health

# Expected response:
# {"status":"ok","timestamp":"2025-11-27T..."}
```

---

## Common Issues & Solutions

### Issue: "Couldn't find that process type (web)"
**Solution:** Make sure Procfile is at the root of your backend folder

### Issue: "Application Error" or H10 error
**Causes:**
- MongoDB connection failed (check MONGODB_URI)
- Missing environment variables
- Puppeteer crash (check buildpack)

**Fix:**
```bash
heroku logs --tail  # Check specific error
heroku restart      # Restart dyno
```

### Issue: Build succeeds but app crashes
**Solution:** Check if all environment variables are set:
```bash
heroku config
```

### Issue: Puppeteer crashes with "Failed to launch chrome"
**Solution:** Verify buildpack is installed:
```bash
heroku buildpacks
# Should show puppeteer-heroku-buildpack BEFORE nodejs
```

### Issue: Port binding error
**Solution:** Make sure server.js uses `process.env.PORT` (already configured correctly)

---

## Memory Issues

If you experience crashes with Puppeteer, upgrade to a better dyno:

```bash
# Check current dyno:
heroku ps

# Upgrade to Hobby dyno (recommended for production):
heroku dyno:type hobby
```

Free dynos have limited memory which may cause Puppeteer to crash.

---

## Alternative: Deploy to Render (Easier for Puppeteer)

Render handles Puppeteer better than Heroku:

1. Go to https://dashboard.render.com/
2. New Web Service → Connect your GitHub repo
3. Configure:
   - Root Directory: `backend`
   - Build Command: `yarn install`
   - Start Command: `yarn start`
4. Add environment variables in dashboard
5. Deploy!

Render automatically installs Chrome for Puppeteer.

---

## Verify Deployment Worked

After deployment, test these endpoints:

```bash
# Base route
curl https://your-app.herokuapp.com/

# Health check
curl https://your-app.herokuapp.com/api/health

# With your frontend
# Update frontend .env to point to: https://your-app.herokuapp.com
```

---

## Rollback if Needed

```bash
# See release history:
heroku releases

# Rollback to previous version:
heroku rollback v12  # replace with desired version
```

---

## Need Help?

1. Check logs: `heroku logs --tail`
2. Verify buildpacks: `heroku buildpacks`
3. Check environment: `heroku config`
4. Test locally: `yarn start` in backend folder
5. See DEPLOYMENT.md for more detailed troubleshooting

