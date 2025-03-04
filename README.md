# Raindrop.io to Notion Sync

This project automatically syncs bookmarks from Raindrop.io to a Notion database using Vercel Cron Jobs.

## Setup

1. Create a new Vercel project and deploy this repository.

2. Set up the following environment variables in your Vercel project:

   - `RAINDROP_API_KEY`: Your Raindrop.io API key
   - `NOTION_API_KEY`: Your Notion API key
   - `NOTION_DATABASE_ID`: The ID of your Notion database
   - `RAINDROP_TAG`: The tag to watch for in Raindrop.io

3. Create a Notion database with the following properties:

   - Name (title)
   - URL (url)
   - Description (rich text)
   - Tags (multi-select)

4. Share your Notion database with the integration you created in the Notion developer settings.

## How it works

The script runs every 15 minutes and:

1. Fetches bookmarks from Raindrop.io that have the specified tag
2. Adds new bookmarks to your Notion database
3. Includes the bookmark's title, URL, description, and tags

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file with the required environment variables

3. Run the script locally:
   ```bash
   npm run dev
   ```

## API Endpoints

- `GET /api/cron`: The endpoint that Vercel Cron Jobs calls to sync bookmarks
