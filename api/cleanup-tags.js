require("dotenv").config();
const axios = require("axios");
const readline = require("readline");

// Initialize Raindrop.io client
const raindropClient = axios.create({
  baseURL: "https://api.raindrop.io/rest/v1",
  headers: {
    Authorization: `Bearer ${process.env.RAINDROP_CLIENT_SECRET}`,
  },
});

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

async function askForConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function cleanupSingleUseTags() {
  console.log("Starting tag cleanup...");

  try {
    // Get all tags
    console.log("Fetching all tags...");
    const tagsResponse = await retryWithBackoff(() =>
      raindropClient.get("/tags")
    );
    const allTags = tagsResponse.data.items;

    console.log(`Found ${allTags.length} total tags`);
    if (allTags.length !== 388) {
      console.log(
        `WARNING: Expected 388 tags but got ${allTags.length}. This might indicate an issue with the API response.`
      );
    }

    // Log tag usage distribution
    const tagCounts = allTags.map((tag) => tag.count);
    const minCount = Math.min(...tagCounts);
    const maxCount = Math.max(...tagCounts);
    const avgCount = tagCounts.reduce((a, b) => a + b, 0) / tagCounts.length;
    console.log("\nTag usage statistics:");
    console.log(`- Minimum usage: ${minCount}`);
    console.log(`- Maximum usage: ${maxCount}`);
    console.log(`- Average usage: ${avgCount.toFixed(2)}`);

    // Find single-use tags
    const singleUseTags = allTags.filter((tag) => tag.count === 1);
    console.log(`\nFound ${singleUseTags.length} single-use tags`);

    if (singleUseTags.length === 0) {
      console.log("No single-use tags found. Nothing to clean up.");
      return;
    }

    // Sort single-use tags alphabetically
    const sortedSingleUseTags = singleUseTags.sort((a, b) =>
      a._id.toLowerCase().localeCompare(b._id.toLowerCase())
    );

    // Show summary of tags to be deleted
    console.log("\nTags to be deleted (alphabetical order):");
    sortedSingleUseTags.forEach((tag) => {
      console.log(`- ${tag._id}`);
    });

    // Ask for confirmation
    const shouldProceed = await askForConfirmation(
      `\nDo you want to delete these ${singleUseTags.length} single-use tags? (y/N): `
    );

    if (!shouldProceed) {
      console.log("\nOperation cancelled by user.");
      return;
    }

    // Delete single-use tags in batches of 50 to avoid request size limits
    const batchSize = 50;
    let deletedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < sortedSingleUseTags.length; i += batchSize) {
      const batch = sortedSingleUseTags.slice(i, i + batchSize);
      const tagNames = batch.map((tag) => tag._id);

      try {
        await retryWithBackoff(() =>
          raindropClient.delete("/tags", {
            data: { tags: tagNames },
          })
        );

        console.log(`Successfully deleted ${tagNames.length} tags`);
        deletedCount += tagNames.length;
      } catch (error) {
        console.error(`Failed to delete batch of tags: ${error.message}`);
        failedCount += tagNames.length;
      }

      // Add delay between batches
      if (i + batchSize < sortedSingleUseTags.length) {
        await delay(2000);
      }
    }

    console.log("\nTag cleanup summary:");
    console.log(`- Tags deleted: ${deletedCount}`);
    console.log(`- Tags failed to delete: ${failedCount}`);
  } catch (error) {
    console.error("Error during tag cleanup:", error.message);
    process.exit(1);
  }
}

// Run the cleanup if this script is executed directly
if (require.main === module) {
  cleanupSingleUseTags();
}

module.exports = cleanupSingleUseTags;
