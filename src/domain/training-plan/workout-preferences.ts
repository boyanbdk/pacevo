import type { WorkoutFamily } from "./types";

export type WorkoutFeedbackType = "like" | "dislike" | "favourite" | "unfavourite" | "swap";

export type WorkoutFeedbackReason =
  | "too_hard"
  | "too_boring"
  | "too_long"
  | "too_much_speed"
  | "too_structured"
  | "schedule_fit"
  | "other";

export type WorkoutFeedback = {
  id: string;
  planId: string;
  sessionId: string;
  recipeId: string;
  recipeFamily: WorkoutFamily;
  type: WorkoutFeedbackType;
  reason?: WorkoutFeedbackReason;
  createdAt: string;
};

export type UserWorkoutPreference = {
  recipeId: string;
  recipeFamily: WorkoutFamily;
  score: number;
  likes: number;
  dislikes: number;
  favourites: number;
  swapsAway: number;
  updatedAt: string;
};

export const MAX_PREFERENCE_BIAS = 3;

function clampPreference(score: number): number {
  return Math.max(-MAX_PREFERENCE_BIAS, Math.min(MAX_PREFERENCE_BIAS, score));
}

function emptyPreference(feedback: WorkoutFeedback): UserWorkoutPreference {
  return {
    recipeId: feedback.recipeId,
    recipeFamily: feedback.recipeFamily,
    score: 0,
    likes: 0,
    dislikes: 0,
    favourites: 0,
    swapsAway: 0,
    updatedAt: feedback.createdAt,
  };
}

export function calculateWorkoutPreferences(
  feedback: WorkoutFeedback[],
): UserWorkoutPreference[] {
  const byRecipe = new Map<string, UserWorkoutPreference>();

  for (const event of feedback) {
    const pref = byRecipe.get(event.recipeId) ?? emptyPreference(event);

    switch (event.type) {
      case "like":
        pref.likes += 1;
        pref.score += 1;
        break;
      case "dislike":
        pref.dislikes += 1;
        pref.score -= event.reason === "too_hard" ? 3 : 2;
        break;
      case "favourite":
        pref.favourites += 1;
        pref.score += 2;
        break;
      case "unfavourite":
        pref.favourites = Math.max(0, pref.favourites - 1);
        pref.score -= 2;
        break;
      case "swap":
        pref.swapsAway += 1;
        pref.score -= 2;
        break;
    }

    pref.score = clampPreference(pref.score);
    pref.updatedAt = event.createdAt;
    byRecipe.set(event.recipeId, pref);
  }

  return [...byRecipe.values()].sort((a, b) => a.recipeId.localeCompare(b.recipeId));
}

export function preferenceBiasForRecipe(
  recipeId: string,
  recipeFamily: WorkoutFamily,
  preferences: UserWorkoutPreference[],
): number {
  const direct = preferences.find((p) => p.recipeId === recipeId)?.score ?? 0;
  const familyPrefs = preferences.filter((p) => p.recipeFamily === recipeFamily);
  const familyScore = familyPrefs.length
    ? familyPrefs.reduce((sum, pref) => sum + pref.score, 0) / familyPrefs.length
    : 0;

  return clampPreference(direct + familyScore * 0.5);
}

export function latestFeedbackForSession(
  feedback: WorkoutFeedback[],
  sessionId: string,
): WorkoutFeedback | undefined {
  return feedback
    .filter((event) => event.sessionId === sessionId)
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
}
