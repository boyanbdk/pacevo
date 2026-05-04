import { describe, expect, test } from "vitest";
import {
  calculateWorkoutPreferences,
  latestFeedbackForSession,
  preferenceBiasForRecipe,
  type WorkoutFeedback,
} from "./workout-preferences";

function feedback(
  overrides: Partial<WorkoutFeedback> & Pick<WorkoutFeedback, "recipeId" | "recipeFamily" | "type">,
): WorkoutFeedback {
  return {
    id: crypto.randomUUID(),
    planId: "plan-1",
    sessionId: "0-1",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("workout preferences", () => {
  test("aggregates likes, dislikes, favourites, swaps, and clamps score", () => {
    const preferences = calculateWorkoutPreferences([
      feedback({ recipeId: "tempo_continuous", recipeFamily: "tempo_continuous", type: "like" }),
      feedback({ recipeId: "tempo_continuous", recipeFamily: "tempo_continuous", type: "favourite" }),
      feedback({ recipeId: "tempo_continuous", recipeFamily: "tempo_continuous", type: "like" }),
      feedback({ recipeId: "tempo_continuous", recipeFamily: "tempo_continuous", type: "like" }),
    ]);

    expect(preferences).toHaveLength(1);
    expect(preferences[0].likes).toBe(3);
    expect(preferences[0].favourites).toBe(1);
    expect(preferences[0].score).toBe(3);
  });

  test("too hard dislike is a stronger negative signal", () => {
    const preferences = calculateWorkoutPreferences([
      feedback({
        recipeId: "interval_5x1000",
        recipeFamily: "interval_long",
        type: "dislike",
        reason: "too_hard",
      }),
    ]);

    expect(preferences[0].dislikes).toBe(1);
    expect(preferences[0].score).toBe(-3);
  });

  test("recipe bias combines direct and family preference with cap", () => {
    const preferences = calculateWorkoutPreferences([
      feedback({ recipeId: "tempo_continuous", recipeFamily: "tempo_continuous", type: "favourite" }),
      feedback({ recipeId: "tempo_continuous", recipeFamily: "tempo_continuous", type: "like" }),
    ]);

    expect(preferenceBiasForRecipe("tempo_continuous", "tempo_continuous", preferences)).toBe(3);
  });

  test("latestFeedbackForSession returns newest event for the session", () => {
    const first = feedback({
      recipeId: "easy_run",
      recipeFamily: "easy",
      type: "like",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const second = feedback({
      recipeId: "easy_run",
      recipeFamily: "easy",
      type: "dislike",
      createdAt: "2026-01-02T00:00:00.000Z",
    });

    expect(latestFeedbackForSession([first, second], "0-1")?.type).toBe("dislike");
  });
});
