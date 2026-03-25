import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

export const UserProfile = a
  .model({
    userId: a.string().required(),
    // The username is a new field for the user's name.
    displayName: a.string().required(), // rename from username (more UX-accurate)
    nativeLanguage: a.string(), // e.g. "zh", "zh-Hans", "es", "en"
    timezone: a.string(), // e.g. "America/Chicago" (auto-detect + confirm)

    growthStyle: a.string().default("FLUENCY"),
    expoPushToken: a.string(),
    preferredReminderHour: a.integer().default(9),
    // Derived knobs (so your algorithm doesn’t hardcode constants on client)
    dailyPacing: a.integer().default(3), // ceiling: max new words/day
    masteryIntervalDays: a.integer().default(180), // days to reach "mastery"
    newwordNotificationsEnabled: a.boolean().default(false),

    overallGoal: a.integer().default(1000), // total words to learn
    daysForGoal: a.integer().default(360), // days to reach overallGoal

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
    // --- Basic Content ---
    word: a.string().required(),
    status: a.enum(["COLLECTED", "LEARNED"]),

    // --- Phonetics & Media ---
    phoneticText: a.string(),
    audioUrl: a.string(),
    imgUrl: a.string(),

    // --- Meanings & Context (Still JSON, but structured) ---
    // These are rarely queried individually, so JSON is okay here,
    // but the high-level metadata should be fields.
    meanings: a.json(), // [{partOfSpeech, definition, synonyms...}]
    exampleSentences: a.json(),
    context: a.string(), // "everyday conversation"
    difficulty: a.string(), // "intermediate"

    // --- SRS / Data Science Fields (CRITICAL) ---
    // Pulling these out allows you to run analytics and line charts
    reviewInterval: a.integer().default(1),
    easeFactor: a.float().default(2.5),
    totalReviews: a.integer().default(0),
    lastReviewedAt: a.datetime(),
    nextReviewDate: a.string(), // Format "YYYY-MM-DD" for easy filtering

    // --- Relationships ---
    wordsListId: a.id(),
    wordsList: a.belongsTo("WordsList", "wordsListId"),
    scheduleWords: a.hasMany("ReviewScheduleWord", "wordId"),
  })
  .secondaryIndexes((index) => [
    // This allows you to fetch "Today's Due Words" instantly
    index("nextReviewDate").queryField("listByReviewDate"),
    // This allows you to track "Words learned over time" for your line charts
    index("status").queryField("listByStatus"),
  ])
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
