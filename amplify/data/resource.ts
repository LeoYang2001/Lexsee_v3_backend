import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

export const UserProfile = a
  .model({
    userId: a.string().required(),
    // The username is a new field for the user's name.
    displayName: a.string().required(), // rename from username (more UX-accurate)
    nativeLanguage: a.string(), // e.g. "zh", "zh-Hans", "es", "en"
    timezone: a.string(), // e.g. "America/Chicago" (auto-detect + confirm)

    growthStyle: a.string().default("FLUENCY"),
    // Derived knobs (so your algorithm doesn’t hardcode constants on client)
    dailyReviewCap: a.integer().default(60), // ceiling: max reviews/day
    dailyNewWordCap: a.integer().default(3), // ceiling: max new words/day

    newwordNotificationsEnabled: a.boolean().default(false),

    // A single wordsList belongs to each user profile.
    wordsList: a.hasOne("WordsList", "userProfileId"),

    onboardingStage: a.string().default("SEARCH"),

    // All review schedules for this user (one per date).
    reviewSchedules: a.hasMany("ReviewSchedule", "userProfileId"),

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
    // This allows the owner to perform all operations on their profile.
    allow.owner(),
    allow.authenticated().to(["read"]),
  ]);

// WordsList is now the single container for a user's words.
export const WordsList = a
  .model({
    // The foreign key to link this list to its parent UserProfile.
    userProfileId: a.id(),
    // The belongsTo relationship defines the link back to the parent.
    userProfile: a.belongsTo("UserProfile", "userProfileId"),
    // This provides a link to all the Word records belonging to this list.
    words: a.hasMany("Word", "wordsListId"),
  })
  .authorization((allow) => [allow.owner()]);

// The Word model now includes a 'status' field to differentiate words.
export const Word = a
  .model({
    // The data field stores the word's content.
    data: a.json().required(),
    // The new status field, which is an enum with predefined values.
    status: a.enum(["COLLECTED", "LEARNED"]), // Added `.required()`
    // The foreign key to link this word to its parent WordsList.
    wordsListId: a.id(),
    // The belongsTo relationship links the word to its WordsList container.
    wordsList: a.belongsTo("WordsList", "wordsListId"),
    scheduleWords: a.hasMany("ReviewScheduleWord", "wordId"),
  })
  .authorization((allow) => [allow.owner()]);

/**
 * ReviewSchedule: one review session per user per date.
 * Example: a row for (user, "2025-11-04") with its notification + summary stats.
 */
export const CompletedReviewSchedule = a
  .model({
    // Owner of this schedule.
    userProfileId: a.id().required(),
    userProfile: a.belongsTo("UserProfile", "userProfileId"),

    // e.g. "2025-11-04" – matches your previous JSON keys.
    scheduleDate: a.string().required(),

    // Expo local notification id for this day's reminder.
    notificationId: a.string(),

    // --- Schedule-level info (summary for that date) ---

    // 0–100 success percentage for that session.
    successRate: a.float(),

    // Total number of words in this session.
    totalWords: a.integer(),

    // Count of words already reviewed.
    reviewedCount: a.integer(),

    // Count of words still to be reviewed.
    toBeReviewedCount: a.integer(),

    // Optional flexible blob if you want to store extra summary info.
    // e.g. { averageScore: 4.2, averageTimePerCard: 3.1, ... }
    scheduleInfo: a.json(),

    // All words that belong to this schedule (per-word review entries).
    scheduleWords: a.hasMany("ReviewScheduleWord", "completedReviewScheduleId"),
  })
  .authorization((allow) => [allow.owner()]);

/**
 * ReviewSchedule: one review session per user per date.
 * Example: a row for (user, "2025-11-04") with its notification + summary stats.
 */
export const ReviewSchedule = a
  .model({
    // Owner of this schedule.
    userProfileId: a.id().required(),
    userProfile: a.belongsTo("UserProfile", "userProfileId"),

    // e.g. "2025-11-04" – matches your previous JSON keys.
    scheduleDate: a.string().required(),

    // Expo local notification id for this day's reminder.
    notificationId: a.string(),

    // --- Schedule-level info (summary for that date) ---

    // 0–100 success percentage for that session.
    successRate: a.float(),

    // Total number of words in this session.
    totalWords: a.integer(),

    // Count of words already reviewed.
    reviewedCount: a.integer(),

    // Count of words still to be reviewed.
    toBeReviewedCount: a.integer(),

    // Optional flexible blob if you want to store extra summary info.
    // e.g. { averageScore: 4.2, averageTimePerCard: 3.1, ... }
    scheduleInfo: a.json(),

    // All words that belong to this schedule (per-word review entries).
    scheduleWords: a.hasMany("ReviewScheduleWord", "reviewScheduleId"),
  })
  .secondaryIndexes((index) => [index("userProfileId")])
  .authorization((allow) => [allow.owner()]);

/**
 * ReviewScheduleWord: one row per (schedule, word) with per-word review info.
 * This replaces your old "reviewWordIds: []" array and lets you track status,
 * score, attempts, etc., per word for that schedule.
 */
export const ReviewScheduleWord = a
  .model({
    // Parent schedule (user + date).
    reviewScheduleId: a.id().required(),
    reviewSchedule: a.belongsTo("ReviewSchedule", "reviewScheduleId"),

    completedReviewScheduleId: a.id(),
    completedReviewSchedule: a.belongsTo(
      "CompletedReviewSchedule",
      "completedReviewScheduleId",
    ),

    // Which word is being reviewed in this schedule.
    wordId: a.id().required(),
    word: a.belongsTo("Word", "wordId"),

    // Whether this word is still pending or already reviewed for this session.
    status: a.enum(["TO_REVIEW", "REVIEWED"]),

    // Per-word review score, e.g. 0–5 based on how well they remembered it.
    score: a.integer(),

    // When this word was answered in this schedule (ISO string or datetime).
    answeredAt: a.string(),

    // Flexible metadata for detailed history if needed:
    // e.g. { timeSpentSec: 3.5, userAnswer: "xxx", isCorrect: true }
    meta: a.json(),
  })
  .secondaryIndexes((index) => [index("reviewScheduleId")])
  .authorization((allow) => [allow.owner()]);

const schema = a.schema({
  UserProfile,
  WordsList,
  Word,
  ReviewSchedule,
  ReviewScheduleWord,
  CompletedReviewSchedule,
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
