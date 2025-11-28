# Netlify Environment Variables Setup

## CORS Fix - Complete Setup Guide

### ✅ Backend Changes (Already Done)
1. Updated CORS to use dynamic origin checking
2. Added `withCredentials: true` to frontend API calls
3. Handles trailing slashes automatically

---

## 🔧 Netlify Environment Variables Required

Go to your Netlify dashboard:
1. Navigate to: **Site settings** → **Environment variables**
2. Add the following variables:

### Production Environment Variables:

```
VITE_ENV=production
VITE_PROD_API_URL=https://caoral-gen-be-6ae2928c40aa.herokuapp.com/api
```

**Important:** Make sure there's NO trailing slash on the API URL!

---

## 🧪 Testing CORS Locally

Create a `.env.local` file in the frontend directory (it's gitignored):

```bash
# .env.local
VITE_ENV=development
VITE_API_URL=http://localhost:3000/api
```

Test with:
```bash
cd frontend
npm run dev
```

---

## 🚀 Deploy to Netlify

After setting environment variables:

```bash
git add .
git commit -m "Fix: CORS configuration and add withCredentials"
git push origin main
```

Netlify will auto-deploy with the environment variables.

---

## 🔍 Verify CORS is Working

### Check Network Tab:
1. Open DevTools → Network tab
2. Make a request to your API
3. Check response headers should include:
   ```
   Access-Control-Allow-Origin: https://coralgen.netlify.app
   Access-Control-Allow-Credentials: true
   ```

### Common CORS Errors and Fixes:

#### Error: "No 'Access-Control-Allow-Origin' header"
**Fix:** Make sure Heroku backend is running and environment variables are set

#### Error: "Credentials flag is true, but Access-Control-Allow-Credentials is not"
**Fix:** Already fixed - backend has `credentials: true`

#### Error: "CORS policy: The value of the 'Access-Control-Allow-Origin' header must not be the wildcard '*'"
**Fix:** Already fixed - using specific origins, not wildcard

---

## 🎯 What Changed

### Backend (`server.js`):
- ✅ Dynamic origin checking function
- ✅ Removes trailing slashes for comparison
- ✅ Allows both with/without trailing slash
- ✅ Logs blocked requests for debugging
- ✅ Allows localhost for development

### Frontend (`services/api.js`):
- ✅ Added `withCredentials: true` to axios
- ✅ This tells the browser to send credentials with CORS requests

---

## 🐛 Debugging

If CORS still fails, check:

1. **Heroku backend is running:**
   ```bash
   curl https://caoral-gen-be-6ae2928c40aa.herokuapp.com/api/health
   ```

2. **Check Heroku logs:**
   ```bash
   heroku logs --tail
   ```
   Look for: `⚠️  CORS blocked request from origin: ...`

3. **Browser console errors:**
   - Open DevTools → Console
   - Look for CORS-related errors

4. **Verify Netlify env vars:**
   - Go to Netlify dashboard
   - Site settings → Environment variables
   - Make sure `VITE_PROD_API_URL` is set

---

## 📝 Summary

**Before:**
- CORS blocked `https://coralgen.netlify.app`
- Trailing slash confusion
- No credentials support

**After:**
- ✅ `https://coralgen.netlify.app` allowed (with or without trailing slash)
- ✅ Credentials enabled for auth
- ✅ Better error logging
- ✅ Environment-based API URLs

**Next Steps:**
1. Set environment variables in Netlify dashboard
2. Commit and push changes
3. Wait for Netlify to rebuild
4. Test at https://coralgen.netlify.app

Your CORS issues should now be resolved! 🎉

