# Onalog Setup Guide

## Quick Start

1. **Install all dependencies:**
```bash
npm run install:all
```

2. **Set up environment variables:**

Create `backend/.env` file with your MongoDB URI and OpenAI API key (see `.env.example` for structure).

3. **Start MongoDB:**

**Option A: Local MongoDB**
```bash
mongod
```

**Option B: MongoDB Atlas (Recommended)**
- Create account at https://www.mongodb.com/cloud/atlas
- Create a free cluster
- Get connection string
- Update `MONGODB_URI` in `.env`

4. **Run the application:**

```bash
npm run dev
```

This starts:
- Backend on http://localhost:3000
- Frontend on http://localhost:5173

## First Search

1. Open http://localhost:5173
2. Enter a business query (e.g., "manufacturing companies in Nigeria")
3. Select country filter (optional)
4. Choose result count (50, 100, or 200)
5. Click "Search"

The system will:
- Search Google for results
- Extract contact details from websites
- Enrich leads with AI predictions
- Display results in the lead table

## Features Overview

### Search
- Enter any business query
- Filter by country
- Select result count (50/100/200)
- Save searches as templates

### Extraction
- Automatically extracts:
  - Company names
  - Websites
  - Email addresses
  - Phone numbers
  - WhatsApp links
  - Social media profiles
  - Addresses
  - Business descriptions

### Enrichment
- AI-powered predictions:
  - Company size (micro/small/medium/large)
  - Revenue bracket
  - Industry category
  - Business summary
  - Signal strength score

### Lead Management
- View lead details in side panel
- Sort by company name or score
- Filter by country, industry, score
- Bulk select leads
- Export to CSV or Excel

### Outreach Assistant
- Generate:
  - One-line introductions
  - WhatsApp openers
  - Email templates
  - Call scripts

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running
- Check `MONGODB_URI` in `.env`
- For Atlas, verify network access settings

### OpenAI API Error
- Verify `OPENAI_API_KEY` in `.env`
- Check API key is valid and has credits
- Ensure model access (gpt-4o-mini)

### Puppeteer/Chrome Errors
- Puppeteer installs Chromium automatically
- If issues, install Chrome manually:
  ```bash
  # macOS
  brew install chromium

  # Linux
  sudo apt-get install chromium-browser
  ```

### Port Already in Use
- Change `PORT` in `backend/.env`
- Change port in `frontend/vite.config.js`

## Production Deployment

### Backend
1. Set `NODE_ENV=production` in `.env`
2. Use process manager (PM2):
   ```bash
   npm install -g pm2
   pm2 start backend/server.js
   ```

### Frontend
1. Build:
   ```bash
   cd frontend
   npm run build
   ```
2. Serve `dist/` folder with nginx or similar

### MongoDB
- Use MongoDB Atlas for production
- Set up proper authentication
- Configure IP whitelist
- Enable backups

## Performance Tips

- Start with 50 results for faster processing
- Use country filters to narrow results
- Save common searches as templates
- Export leads regularly to avoid data loss

## Support

For issues or questions, check:
- README.md for architecture details
- Code comments for implementation notes
- API endpoints in `backend/routes/`

