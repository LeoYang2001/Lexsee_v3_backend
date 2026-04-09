import { defineFunction } from "@aws-amplify/backend";

export const srsReviewNotifier = defineFunction({
  name: "srs-review-notifier",
  entry: "./handler.ts",
  // Runs every hour. You can change this to 'every 1d' for once a day.
  schedule: "every 1h",
  bundling: {
    minify: false,
  },
  // Externalize expo-server-sdk to prevent bundling issues with package.json resolution
  environment: {
    NODE_OPTIONS: "--experimental-require-module",
  },
});
