require("dotenv").config();
const { Client } = require("@notionhq/client");
const axios = require("axios");

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// Initialize Raindrop.io client
const raindropClient = axios.create({
  baseURL: "https://api.raindrop.io/rest/v1",
  headers: {
    Authorization: `Bearer ${process.env.RAINDROP_API_KEY}`,
  },
});

// Configuration
const RAINDROP_TAG = process.env.RAINDROP_TAG; // The tag to watch for
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

async function getRaindropBookmarks() {
  try {
    const response = await raindropClient.get("/raindrops/0", {
      params: {
        tag: RAINDROP_TAG,
        sort: "created",
        order: "desc",
      },
    });
    return response.data.items;
  } catch (error) {
    console.error("Error fetching Raindrop bookmarks:", error.message);
    return [];
  }
}

async function addToNotion(bookmark) {
  try {
    await notion.pages.create({
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: bookmark.title,
              },
            },
          ],
        },
        URL: {
          url: bookmark.link,
        },
        Description: {
          rich_text: [
            {
              text: {
                content: bookmark.excerpt || "",
              },
            },
          ],
        },
        Tags: {
          multi_select: bookmark.tags.map((tag) => ({ name: tag })),
        },
      },
    });
    console.log(`Added bookmark to Notion: ${bookmark.title}`);
  } catch (error) {
    console.error(`Error adding bookmark to Notion: ${error.message}`);
  }
}

async function checkBookmarkExists(url) {
  try {
    const response = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      filter: {
        property: "URL",
        url: {
          equals: url,
        },
      },
    });
    return response.results.length > 0;
  } catch (error) {
    console.error("Error checking for existing bookmark:", error.message);
    return false;
  }
}

async function syncBookmarks() {
  console.log("Starting bookmark sync...");

  const bookmarks = await getRaindropBookmarks();

  for (const bookmark of bookmarks) {
    const exists = await checkBookmarkExists(bookmark.link);
    if (!exists) {
      await addToNotion(bookmark);
    } else {
      console.log(`Bookmark already exists in Notion: ${bookmark.title}`);
    }
  }

  console.log("Bookmark sync completed");
}

// For local testing
if (require.main === module) {
  syncBookmarks();
}

// For Vercel Cron Jobs
module.exports = syncBookmarks;
