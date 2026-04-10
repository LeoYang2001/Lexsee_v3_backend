import { Expo } from "expo-server-sdk";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
// @ts-ignore
import { env } from "$amplify/env/srs-review-notifier";
import type { Schema } from "../../data/resource";
import Module from "module";

// Workaround for expo-server-sdk looking for ../package.json at runtime
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === "../package.json" || id.endsWith("package.json")) {
    return {
      version: "6.1.0",
      name: "expo-server-sdk",
    };
  }
  return originalRequire.apply(this, arguments as any);
};

const expo = new Expo();

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

// Configure Amplify once outside the handler for efficiency
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

export const handler = async (event: any) => {
  const now = new Date().toISOString().split("T")[0];
  console.log(`🔔 Checking SRS for: ${now}`);

  try {
    // 1. Fetch all words due today or earlier using the secondary index
    const { data: dueWords, errors } = await client.models.Word.listWordsByDate(
      {
        scheduledType: "SRS_REVIEW",
        nextReviewDate: { le: now },
      },
    );

    if (errors) {
      console.error("GraphQL Errors:", errors);
      throw new Error(`GraphQL Error: ${JSON.stringify(errors)}`);
    }

    if (!dueWords || dueWords.length === 0) {
      console.log("No words due for review today.");
      return { status: "success", notifiedUsers: 0, totalWords: 0 };
    }

    // 2. Group words by UserProfile ID (Directly from the Word model)
    const userNotificationMap = new Map<string, number>();

    for (const word of dueWords) {
      const profileId = word.userProfileId;

      if (profileId) {
        const count = userNotificationMap.get(profileId) || 0;
        userNotificationMap.set(profileId, count + 1);
      } else {
        console.warn(
          `⚠️ Word ID ${word.id} ("${word.word}") is missing a userProfileId.`,
        );
      }
    }

    // 3. Prepare Expo notifications
    const messages = [];
    for (const [profileId, wordCount] of userNotificationMap.entries()) {
      // Fetch the specific profile to get the push token
      const { data: profile } = await client.models.UserProfile.get({
        id: profileId,
      });

      if (
        profile?.expoPushToken &&
        Expo.isExpoPushToken(profile.expoPushToken)
      ) {
        messages.push({
          to: profile.expoPushToken,
          sound: "default",
          title: "Time for LexSee Reviews! 🧠",
          body: `You have ${wordCount} ${wordCount === 1 ? "word" : "words"} ready for review.`,
          data: { type: "SRS_REVIEW", date: now },
        });
      } else {
        console.log(
          `Skipping profile ${profileId}: No valid Expo token found.`,
        );
      }
    }

    // 4. Send to Expo in chunks
    let sentCount = 0;
    if (messages.length > 0) {
      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          await expo.sendPushNotificationsAsync(chunk);
          sentCount += chunk.length;
        } catch (error) {
          console.error("Failed to send notification chunk:", error);
        }
      }
    }

    console.log(
      `Successfully notified ${sentCount} users about ${dueWords.length} words.`,
    );

    return {
      status: "success",
      notifiedUsers: sentCount,
      totalWords: dueWords.length,
    };
  } catch (error) {
    console.error("SRS Notifier Failed:", error);
    throw error;
  }
};
