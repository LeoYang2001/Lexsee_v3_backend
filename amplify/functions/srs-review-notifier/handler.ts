import { Expo } from "expo-server-sdk";
import { generateClient } from "aws-amplify/api";
import type { Schema } from "../../data/resource";

const expo = new Expo();

export const handler = async (event: any) => {
  const client = generateClient<Schema>();
  const now = new Date().toISOString().split("T")[0];

  try {
    const { data: dueWords } = await (
      client.models.Word as any
    ).getDueWordsByStatus({
      schedulerStatus: "SRS_REVIEW",
      nextReviewDate: { le: now },
    });

    if (!dueWords || dueWords.length === 0) return { status: "none" };

    // Group and send notifications logic...
    // (Use the logic from my previous message here)

    return { status: "success", count: dueWords.length };
  } catch (error) {
    console.error(error);
    throw error;
  }
};
