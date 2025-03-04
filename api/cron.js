require("dotenv").config();
const { Client } = require("@notionhq/client");
const axios = require("axios");

console.log("Starting script with configuration:");
console.log("RAINDROP_TAG:", process.env.RAINDROP_TAG);
console.log("DRY_RUN:", process.env.DRY_RUN);
console.log(
  "NOTION_DATABASE_ID:",
  process.env.NOTION_DATABASE_ID ? "Set" : "Not set"
);
console.log(
  "RAINDROP_CLIENT_SECRET:",
  process.env.RAINDROP_CLIENT_SECRET ? "Set" : "Not set"
);
console.log("NOTION_API_KEY:", process.env.NOTION_API_KEY ? "Set" : "Not set");

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// Initialize Raindrop.io client
const raindropClient = axios.create({
  baseURL: "https://api.raindrop.io/rest/v1",
  headers: {
    Authorization: `Bearer ${process.env.RAINDROP_CLIENT_SECRET}`,
    "Content-Type": "application/json",
  },
});

// Test the client configuration
console.log("Testing Raindrop.io client configuration...");
raindropClient
  .get("/user")
  .then((response) => {
    console.log("Raindrop.io client test successful!");
    console.log("User ID:", response.data.user._id);
  })
  .catch((error) => {
    console.error("Raindrop.io client test failed:", error.message);
    if (error.response) {
      console.error("Error details:", error.response.data);
      console.error("Error status:", error.response.status);
      console.error("Error headers:", error.response.headers);
    }
  });

// Configuration
const RAINDROP_TAG = process.env.RAINDROP_TAG; // The tag to watch for
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const DRY_RUN = process.env.DRY_RUN === "true"; // Enable dry-run mode for development

// Add delay helper function
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Add retry helper function with longer delays
async function retryWithBackoff(fn, maxRetries = 5, initialDelay = 5000) {
  let retries = 0;
  let delay = initialDelay;

  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429 && retries < maxRetries - 1) {
        console.log(
          `Rate limited. Waiting ${delay}ms before retry ${
            retries + 1
          }/${maxRetries}...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        retries++;
        continue;
      }
      throw error;
    }
  }
}

async function getAllBookmarksFromCollection(collectionId) {
  let allBookmarks = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await retryWithBackoff(async () => {
        return await raindropClient.get(`/raindrops/${collectionId}`, {
          params: {
            sort: "created",
            order: "desc",
            page,
            perpage: 50, // Maximum allowed by the API
          },
        });
      });

      if (response.data.items) {
        allBookmarks = allBookmarks.concat(response.data.items);
        console.log(
          `Fetched ${response.data.items.length} bookmarks from page ${
            page + 1
          }`
        );

        // Check if there are more pages
        hasMore = response.data.items.length === 50;
        page++;

        // Add a longer delay between pages to avoid rate limits
        if (hasMore) {
          await delay(1000);
        }
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error(`Error fetching page ${page + 1}:`, error.message);
      // If we hit a rate limit, wait longer and retry
      if (error.response?.status === 429) {
        await delay(5000);
        continue;
      }
      // For other errors, stop fetching this collection
      break;
    }
  }

  return allBookmarks;
}

async function getRaindropBookmarks() {
  try {
    console.log("Fetching user info from Raindrop.io...");
    // Get user info
    const userResponse = await raindropClient.get("/user");
    console.log("User info received:", userResponse.data.user._id);
    const userId = userResponse.data.user._id;

    // First, get all tags
    console.log("\nFetching all tags from Raindrop.io...");
    const tagsResponse = await raindropClient.get("/tags");
    const allTags = tagsResponse.data.items;

    // Log all tags with their counts
    console.log("\nAvailable tags:");
    allTags.forEach((tag) => {
      console.log(`- ${tag._id} (${tag.count} bookmarks)`);
    });

    // Find our target tag
    const targetTag = RAINDROP_TAG.toLowerCase().replace(/^#/, "");
    const matchingTag = allTags.find(
      (tag) => tag._id.toLowerCase() === targetTag
    );

    if (!matchingTag) {
      console.log(`\nError: No tag found matching "${targetTag}"`);
      console.log("Please check the tag name in your .env file");
      return [];
    }

    console.log(
      `\nFound tag "${matchingTag._id}" with ${matchingTag.count} bookmarks`
    );

    // Get bookmarks using the search endpoint with tag filter
    let allBookmarks = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await retryWithBackoff(async () => {
          return await raindropClient.get(`/raindrops/0`, {
            params: {
              search: JSON.stringify([{ key: "tag", val: matchingTag._id }]),
              sort: "created",
              order: "desc",
              page,
              perpage: 50,
            },
          });
        });

        if (response.data.items) {
          allBookmarks = allBookmarks.concat(response.data.items);
          console.log(
            `Fetched ${response.data.items.length} bookmarks from page ${
              page + 1
            }`
          );

          // Check if there are more pages
          hasMore = response.data.items.length === 50;
          page++;

          // Add a delay between pages to avoid rate limits
          if (hasMore) {
            await delay(1000);
          }
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.error(`Error fetching page ${page + 1}:`, error.message);
        if (error.response?.status === 429) {
          await delay(5000);
          continue;
        }
        break;
      }
    }

    console.log(`\nTotal bookmarks fetched: ${allBookmarks.length}`);

    // No need to filter bookmarks since we're already getting only the ones with our tag
    return allBookmarks;
  } catch (error) {
    console.error("Error fetching Raindrop bookmarks:", error.message);
    if (error.response) {
      console.error("Error details:", error.response.data);
      console.error("Error status:", error.response.status);
      console.error("Error headers:", error.response.headers);
    }
    throw error;
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
        Tags: {
          multi_select: bookmark.tags.map((tag) => ({ name: tag })),
        },
      },
      children: bookmark.excerpt
        ? [
            {
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [
                  {
                    type: "text",
                    text: {
                      content: bookmark.excerpt,
                    },
                  },
                ],
              },
            },
          ]
        : [],
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
  try {
    console.log("Starting bookmark sync...");
    if (DRY_RUN) {
      console.log("DRY RUN MODE ENABLED - No changes will be made to Notion");
    }

    // Get all bookmarks with the specified tag
    const bookmarks = await getRaindropBookmarks();

    if (bookmarks.length === 0) {
      console.log("No bookmarks found with the specified tag.");
      return;
    }

    // Process each bookmark
    for (const bookmark of bookmarks) {
      try {
        // Check if the bookmark already exists in Notion
        const exists = await checkBookmarkExists(bookmark.link);

        if (!exists) {
          if (DRY_RUN) {
            console.log(
              `[DRY RUN] Would add bookmark to Notion: ${bookmark.title}`
            );
            console.log(`URL: ${bookmark.link}`);
            console.log(`Tags: ${bookmark.tags.join(", ")}`);
            console.log("---");
          } else {
            console.log(`Adding new bookmark to Notion: ${bookmark.title}`);
            await addToNotion(bookmark);
            // Add a small delay between additions to avoid rate limits
            await delay(1000);
          }
        } else {
          console.log(`Bookmark already exists in Notion: ${bookmark.title}`);
        }
      } catch (error) {
        console.error(
          `Error processing bookmark ${bookmark.title}:`,
          error.message
        );
      }
    }

    if (DRY_RUN) {
      console.log("\nDRY RUN SUMMARY:");
      console.log(
        `Total bookmarks found with tag "${RAINDROP_TAG}": ${bookmarks.length}`
      );
      console.log("No changes were made to Notion database");
    } else {
      console.log("Bookmark sync completed successfully!");
    }
  } catch (error) {
    console.error("Error during bookmark sync:", error.message);
    throw error;
  }
}

// Export the handler for Vercel
module.exports = async (req, res) => {
  try {
    await syncBookmarks();
    res.status(200).json({
      message: DRY_RUN
        ? "Dry run completed successfully"
        : "Sync completed successfully",
      dryRun: DRY_RUN,
    });
  } catch (error) {
    console.error("Error in handler:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// For local testing
if (require.main === module) {
  console.log("Running script locally...");
  syncBookmarks()
    .then(() => {
      console.log("Script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Script failed:", error);
      process.exit(1);
    });
}
