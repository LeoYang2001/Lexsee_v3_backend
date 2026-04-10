import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { srsReviewNotifier } from "../functions/srs-review-notifier/resource";

export const UserProfile = a
  .model({
    userId: a.string().required(),
    displayName: a.string().required(),
    nativeLanguage: a.string(),
    timezone: a.string(),
    growthStyle: a.string().default("FLUENCY"),
    expoPushToken: a.string(),
    preferredReminderHour: a.integer().default(9),
    dailyPacing: a.integer().default(3),
    masteryIntervalDays: a.integer().default(180),
    newwordNotificationsEnabled: a.boolean().default(false),
    overallGoal: a.integer().default(1000),
    daysForGoal: a.integer().default(360),
    onboardingStage: a.string().default("SEARCH"),
    currentStreak: a.integer().default(0),

    // --- Direct Relationship to Words ---
    words: a.hasMany("Word", "userProfileId"),

    completedReviewSchedules: a.hasMany(
      "CompletedReviewSchedule",
      "userProfileId",
    ),
  })
  .secondaryIndexes((index) => [
    index("userId").queryField("listByUserId"),
    index("displayName").queryField("listByDisplayName"),
  ])
  .authorization((allow) => [
    allow.owner(),
    allow.authenticated().to(["read"]),
  ]);

// The Word model now includes a 'status' field to differentiate words.
export const Word = a
  .model({
    word: a.string().required(),
    status: a.enum(["COLLECTED", "LEARNED"]),
    phoneticText: a.string(),
    audioUrl: a.string(),
    imgUrl: a.string(),
    meanings: a.json(),
    exampleSentences: a.json(),
    translatedMeanings: a.json(),

    // --- SRS Fields ---
    reviewInterval: a.integer().default(1),
    easeFactor: a.float().default(2.5),
    reviewedTimeline: a.json(),
    nextReviewDate: a.string(),
    scheduledType: a.string().default("SRS_REVIEW"),

    // --- Relationship to UserProfile ---
    userProfileId: a.id(),
    userProfile: a.belongsTo("UserProfile", "userProfileId"),
  })
  .secondaryIndexes((index) => [
    index("scheduledType")
      .sortKeys(["nextReviewDate"])
      .queryField("listWordsByDate"),
    index("status").queryField("listByStatus"),
  ])
  .authorization((allow) => [allow.owner()]);

/**
 * ReviewSchedule: one review session per user per date.
 * Example: a row for (user, "2025-11-04") with its notification + summary stats.
 */
export const CompletedReviewSchedule = a
  .model({
    userProfileId: a.id().required(),
    userProfile: a.belongsTo("UserProfile", "userProfileId"),
    scheduleDate: a.string().required(),
    reviewLogs: a.json(),
    totalWords: a.integer(),
  })
  .authorization((allow) => [allow.owner()]);

const schema = a
  .schema({
    UserProfile,
    Word,
    CompletedReviewSchedule,
  })
  .authorization((allow) => [
    // "query" allows the Lambda to find words (read)
    // "mutate" allows the Lambda to update words (e.g. mark as notified)
    allow.resource(srsReviewNotifier).to(["query", "mutate"]),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
    apiKeyAuthorizationMode: { expiresInDays: 7 },
  },
});
