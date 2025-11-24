# Onalog - B2B Lead Discovery Platform

Low-cost lead discovery built into a structured visual world. Convert any business search into a structured lead list with extraction, enrichment, and outreach tools.

## Core Flow

**Search → Extract → Enrich → Action**

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: MongoDB
- **Frontend**: Vue 3 + Vite
- **Design System**: Frank Stella geometric structure

## Features

- ✅ Google search scraping with Puppeteer
- ✅ Contact extraction (emails, phones, socials)
- ✅ AI-powered enrichment (company size, revenue, industry)
- ✅ Duplicate detection
- ✅ Lead list with sorting and filtering
- ✅ Lead detail panel
- ✅ Outreach assistant (WhatsApp, email, call scripts)
- ✅ CSV/Excel export
- ✅ Save search templates
- ✅ Stella geometric UI design

## Setup

### Prerequisites

- Node.js 18+ 
- MongoDB (local or Atlas)
- OpenAI API key

### Installation

1. **Clone and install dependencies:**

```bash
npm run install:all
```

2. **Configure environment:**

Create `backend/.env` file with your MongoDB URI and OpenAI API key (see `.env.example` for structure).

3. **Start MongoDB:**

If using local MongoDB:
```bash
mongod
```

Or use MongoDB Atlas and update `MONGODB_URI` in `.env`.

4. **Run the application:**

```bash
npm run dev
```

This starts both backend (port 3000) and frontend (port 5173).

Or run separately:

```bash
# Backend
npm run dev:backend

# Frontend (in another terminal)
npm run dev:frontend
```

## Usage

1. **Search**: Enter a business query, select country filter, and result count
2. **Extract**: System automatically extracts contact details from websites
3. **Enrich**: AI enriches leads with company size, revenue, industry predictions
4. **Action**: View lead details, generate outreach lines, export to CSV/Excel

## API Endpoints

### Search
- `POST /api/search` - Create new search
- `GET /api/search/:id` - Get search status and results
- `GET /api/search` - List all searches
- `POST /api/search/:id/save` - Save search as template
- `GET /api/search/templates/list` - List saved templates

### Leads
- `GET /api/leads` - List leads with filters
- `GET /api/leads/:id` - Get lead details
- `POST /api/leads/:id/outreach` - Generate outreach lines
- `POST /api/leads/bulk-select` - Get multiple leads

### Export
- `GET /api/export/csv?searchId=xxx` - Export as CSV
- `GET /api/export/excel?searchId=xxx` - Export as Excel

## Design System

The UI follows Frank Stella's geometric structure:

- **Layout**: Precise rectangular blocks, strong horizontal segmentation
- **Colors**: Two neutrals + one accent (blue)
- **Typography**: Sans-serif (Inter), heavy weight for titles
- **Motion**: Straight slide transitions, no curves, constant speed
- **No shadows, no gradients, sharp edges only**

## Performance Targets

- Search → enriched list under 25 seconds
- 60%+ enrichment coverage
- Repeat searches under 3 clicks
- First outreach drafted within 10 seconds

## Architecture

### Backend Structure

```
backend/
├── models/          # MongoDB schemas (Lead, Search, User)
├── routes/          # API routes
├── services/        # Business logic
│   ├── googleSearch.js
│   ├── extractor.js
│   ├── enricher.js
│   └── duplicateDetector.js
└── server.js        # Express app
```

### Frontend Structure

```
frontend/
├── src/
│   ├── components/  # Vue components
│   ├── views/       # Page views
│   ├── stores/      # Pinia stores
│   ├── services/    # API client
│   └── router/      # Vue Router
└── style.css        # Stella design system
```

## Development

### Backend Development

```bash
cd backend
npm run dev
```

### Frontend Development

```bash
cd frontend
npm run dev
```

### Building for Production

```bash
cd frontend
npm run build
```

## Notes

- No Redis required - simple in-process job queue
- MongoDB Atlas free tier compatible
- Low-bandwidth safe design
- Mobile responsive
- output logs on heroku
    ```cmd
    heroku logs --app=caoral-gen-be -n 500 >> heroku.log

    // steps to make heroku run the /backend folder
    heroku buildpacks:add -a caoral-gen-be https://github.com/lstoll/heroku-buildpack-monorepo

    heroku config:set -a caoral-gen-be APP_BASE=backend


    ```

## License

ISC

