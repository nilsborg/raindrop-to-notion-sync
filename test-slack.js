require("dotenv").config();
const axios = require("axios");

async function testSlackNotification() {
  try {
    console.log("Testing Slack notification...");

    const payload = {
      attachments: [
        {
          color: "danger",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "*Raindrop.io to Notion Sync Test Notification* 🧪",
              },
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: "*Repository:*\nraindrop-to-notion-sync",
                },
                {
                  type: "mrkdwn",
                  text: "*Workflow:*\nLocal Test",
                },
                {
                  type: "mrkdwn",
                  text: "*Trigger:*\nManual Test",
                },
                {
                  type: "mrkdwn",
                  text: "*Branch:*\nmain",
                },
              ],
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "*Test Message:*\n```This is a test notification from your local environment. If you see this, Slack notifications are working correctly!```",
              },
            },
          ],
        },
      ],
    };

    const response = await axios.post(process.env.SLACK_WEBHOOK_URL, payload);

    if (response.status === 200) {
      console.log("✅ Slack notification sent successfully!");
    }
  } catch (error) {
    console.error("❌ Failed to send Slack notification:", error.message);
    if (error.response) {
      console.error("Error details:", error.response.data);
    }
  }
}

// Run the test
testSlackNotification();
