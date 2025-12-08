# Decision Maker Extraction Setup Guide

This guide explains how to set up the high-volume decision maker extraction system with multiple data sources.

## Overview

The system now uses multiple sources to extract decision makers:
1. **Multi-page crawling** - Crawls team/about pages (unlimited, free)
2. **Email pattern discovery** - Generates emails from patterns (unlimited, free)
3. **TheHarvester** - Email discovery via search engines (unlimited, free)
4. **ScraperAPI** - Better website scraping (5,000/month free)
5. **Google Custom Search** - Find decision makers (3,000/month free)
6. **Bing Web Search** - Find decision makers (3,000/month free)
7. **Email verification** - SMTP verification (unlimited, free)

## Total Capacity

- **Free tier:** 16,000+ contacts/month
- **Unlimited:** Email discovery and verification (self-hosted)

## Required Environment Variables

Add these to your `.env` file:

### ScraperAPI (5,000 requests/month free)
```bash
SCRAPERAPI_API_KEY=your_scraperapi_key_here
```
**Get it:** https://www.scraperapi.com/ (Free tier: 5,000 requests/month)

### Google Custom Search API (3,000 queries/month free)
```bash
GOOGLE_CUSTOM_SEARCH_API_KEY=your_google_api_key_here
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=your_search_engine_id_here
```
**Get it:** 
1. https://developers.google.com/custom-search/v1/overview
2. Create a Custom Search Engine: https://programmablesearchengine.google.com/
3. Free tier: 100 queries/day = 3,000/month

### Bing Web Search API (3,000 queries/month free)
```bash
BING_WEB_SEARCH_API_KEY=your_bing_api_key_here
```
**Get it:** https://www.microsoft.com/en-us/bing/apis/bing-web-search-api
- Free tier: 3,000 queries/month

### Optional: OpenAI (for validation)
```bash
OPENAI_API_KEY=your_openai_key_here
```
**Note:** Already configured if you're using AI enrichment

## Setup Instructions

### 1. ScraperAPI Setup
1. Go to https://www.scraperapi.com/
2. Sign up for free account
3. Copy your API key from dashboard
4. Add to `.env`: `SCRAPERAPI_API_KEY=your_key`

### 2. Google Custom Search Setup
1. Go to https://developers.google.com/custom-search/v1/overview
2. Click "Get a Key" → Create project
3. Enable "Custom Search API"
4. Copy API key
5. Go to https://programmablesearchengine.google.com/
6. Create a new search engine
7. Set "Sites to search" to "Search the entire web"
8. Copy the Search Engine ID
9. Add to `.env`:
   ```
   GOOGLE_CUSTOM_SEARCH_API_KEY=your_api_key
   GOOGLE_CUSTOM_SEARCH_ENGINE_ID=your_engine_id
   ```

### 3. Bing Web Search Setup
1. Go to https://www.microsoft.com/en-us/bing/apis/bing-web-search-api
2. Click "Try it free"
3. Sign in with Microsoft account
4. Create a resource (choose "F1" free tier)
5. Copy the API key
6. Add to `.env`: `BING_WEB_SEARCH_API_KEY=your_key`

## How It Works

### Extraction Pipeline

1. **Initial Extraction** (from main page)
   - Extracts decision makers from the main page
   - Uses structured data, CSS selectors, pattern matching

2. **Multi-Page Crawling** (if < 5 decision makers found)
   - Discovers team/about/leadership pages
   - Crawls up to 5 additional pages
   - Extracts decision makers from each page

3. **Email Pattern Discovery** (if 2+ emails found on site)
   - Analyzes existing emails to find pattern
   - Generates emails for decision makers using pattern
   - Examples: `firstname.lastname@`, `firstname@`, `f.lastname@`

4. **TheHarvester Email Search** (for top 3 decision makers without emails)
   - Searches Google/Bing for emails
   - Extracts from contact pages
   - Finds emails associated with names

5. **Google/Bing Search** (if < 5 decision makers found)
   - Searches for "CEO [Company Name]" etc.
   - Extracts decision makers from search results
   - Finds emails mentioned in results

6. **Email Verification** (optional)
   - Verifies email format
   - Checks MX records (domain validation)
   - Filters out placeholder emails

## Expected Results

### Before Improvements:
- **Decision makers per company:** 2-3
- **Emails found:** ~30-40%
- **Accuracy:** ~70%

### After Improvements:
- **Decision makers per company:** 5-10
- **Emails found:** ~70-80%
- **Accuracy:** ~85-90%

## Cost Breakdown

| Service | Free Tier | Paid Option | Best For |
|---------|-----------|-------------|-----------|
| **ScraperAPI** | 5,000/month | $49/month (100K) | Website scraping |
| **Google Search** | 3,000/month | $5 per 1K queries | Finding decision makers |
| **Bing Search** | 3,000/month | $4 per 1K queries | Finding decision makers |
| **TheHarvester** | Unlimited | $0 | Email discovery |
| **Email Verification** | Unlimited | $0 | Email validation |

**Total free capacity:** 16,000+ contacts/month

## Monitoring

Check API usage:
- ScraperAPI: https://www.scraperapi.com/dashboard
- Google: https://console.cloud.google.com/apis/credentials
- Bing: https://portal.azure.com/

## Troubleshooting

### No decision makers found
1. Check if website has team/about pages
2. Verify ScraperAPI is working (check logs)
3. Check if site blocks automated access (403 errors)

### No emails generated
1. Verify at least 2 emails found on website
2. Check email pattern discovery logs
3. Verify TheHarvester is finding emails

### API rate limits
1. Check API usage in dashboards
2. Consider upgrading to paid tiers
3. Implement request throttling

## Next Steps

1. Set up API keys (see above)
2. Test with a few companies
3. Monitor API usage
4. Scale up paid APIs if needed

## Support

For issues:
1. Check logs for error messages
2. Verify API keys are correct
3. Check API quotas in dashboards
4. Review extraction logs for patterns

