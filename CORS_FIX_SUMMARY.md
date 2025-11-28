# CORS Fix Summary

## Problem
CORS error when accessing API from `https://coralgen.netlify.app`

## Root Causes
1. Trailing slash mismatch in origin checking
2. Missing `withCredentials` in frontend requests
3. Static origin array couldn't handle variations

---

## ✅ What Was Fixed

### Backend (`backend/server.js`)
```javascript
// Before: Static array
origin: ['http://localhost:5173', 'https://coralgen.netlify.app/']

// After: Dynamic function
origin: function (origin, callback) {
  // Normalizes URLs and handles trailing slashes
  // Allows: localhost:5173, localhost:5174, coralgen.netlify.app
}
```

**Benefits:**
- ✅ Handles trailing slashes automatically
- ✅ Better error logging (shows blocked origins in console)
- ✅ Allows requests with no origin (Postman, mobile apps)
- ✅ Environment variable support

### Frontend (`frontend/src/services/api.js`)
```javascript
// Added withCredentials
const api = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true,  // ← NEW: Required for CORS with credentials
  headers: { 'Content-Type': 'application/json' }
});
```

**Why this matters:**
- Allows cookies and auth headers in cross-origin requests
- Required when backend has `credentials: true` in CORS config

---

## 🚀 Deployment Steps

### 1. Set Netlify Environment Variables
Go to: **Netlify Dashboard** → **Site settings** → **Environment variables**

Add:
```
VITE_ENV=production
VITE_PROD_API_URL=https://caoral-gen-be-6ae2928c40aa.herokuapp.com/api
```

### 2. Deploy Backend to Heroku
```bash
cd /Users/chuks/Documents/onalog
git add backend/server.js
git commit -m "Fix: CORS dynamic origin checking"
git push chuks $(git subtree split --prefix backend main):heroku --force
```

### 3. Deploy Frontend to Netlify
```bash
git add frontend/src/services/api.js frontend/NETLIFY_ENV_SETUP.md
git commit -m "Fix: Add withCredentials for CORS"
git push origin main
```

Netlify will auto-deploy.

---

## 🧪 Test It

After deployment:

1. Visit https://coralgen.netlify.app
2. Open DevTools → Console (should be no CORS errors)
3. Try logging in or making an API call
4. Check Network tab → Response headers should show:
   ```
   Access-Control-Allow-Origin: https://coralgen.netlify.app
   Access-Control-Allow-Credentials: true
   ```

---

## 📋 Checklist

- [x] Backend CORS updated with dynamic origin checking
- [x] Frontend axios configured with `withCredentials: true`
- [ ] Netlify environment variables set (do this manually)
- [ ] Backend deployed to Heroku
- [ ] Frontend deployed to Netlify
- [ ] Test at https://coralgen.netlify.app

---

## 🐛 If CORS Still Fails

1. Check Heroku logs: `heroku logs --tail`
   - Look for: `⚠️  CORS blocked request from origin: ...`

2. Verify Netlify env vars are set correctly

3. Check browser console for specific error messages

4. Make sure backend is running:
   ```bash
   curl https://caoral-gen-be-6ae2928c40aa.herokuapp.com/api/health
   ```

See `frontend/NETLIFY_ENV_SETUP.md` for detailed troubleshooting.

