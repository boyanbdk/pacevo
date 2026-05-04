import { describe, expect, test } from "vitest";
import { selectWorkoutRecipe } from "./select-workout-recipe";
import { pacesFromVdot } from "./vdot";
import type { WorkoutContext } from "./types";

function makeCtx(overrides: Partial<WorkoutContext> = {}): WorkoutContext {
  return {
    dayIndex: 2,
    date: new Date("2026-06-09"),
    targetKm: 10,
    paces: pacesFromVdot(50),
    level: "intermediate",
    phase: "build",
    goalRace: "half",
    weeklyKm: 60,
    weekIndex: 6,
    ...overrides,
  };
}

describe("selectWorkoutRecipe", () => {
  test("selects deterministic output for identical context", () => {
    const ctx = makeCtx();
    const a = selectWorkoutRecipe({ target: "quality", ctx, daysPerWeek: 5 });
    const b = selectWorkoutRecipe({ target: "quality", ctx, daysPerWeek: 5 });

    expect(a.id).toBe(b.id);
  });

  test("applies hard filters for race, level, phase, weekly km, and days", () => {
    const ctx = makeCtx({
      goalRace: "5K",
      level: "beginner",
      phase: "base",
      weeklyKm: 16,
      weekIndex: 2,
    });

    const recipe = selectWorkoutRecipe({ target: "quality", ctx, daysPerWeek: 3 });

    expect(recipe.goalRaces).toContain("5K");
    expect(recipe.levels).toContain("beginner");
    expect(recipe.minDaysPerWeek).toBeLessThanOrEqual(3);
    expect(recipe.stressScore).toBeLessThanOrEqual(2);
    expect(recipe.stimulus).not.toBe("vo2max");
  });

  test("avoids recent quality recipes when alternatives exist", () => {
    const ctx = makeCtx();
    const first = selectWorkoutRecipe({ target: "quality", ctx, daysPerWeek: 5 });
    const next = selectWorkoutRecipe({
      target: "quality",
      ctx,
      daysPerWeek: 5,
      recentRecipeIds: [first.id],
    });

    expect(next.id).not.toBe(first.id);
  });

  test("prefers cutback long-run recipe for deload weeks", () => {
    const ctx = makeCtx({ targetKm: 18, phase: "base" });
    const recipe = selectWorkoutRecipe({
      target: "long",
      ctx,
      daysPerWeek: 5,
      preferCutback: true,
    });

    expect(recipe.id).toBe("cutback_long");
  });

  test("speed focus biases base quality work toward speed stimuli", () => {
    const ctx = makeCtx({ phase: "base", goalRace: "10K", weeklyKm: 55 });
    const recipe = selectWorkoutRecipe({
      target: "quality",
      ctx,
      daysPerWeek: 5,
      trainingFocus: "speed",
    });

    expect(["speed", "vo2max"]).toContain(recipe.stimulus);
  });

  test("comfortable difficulty does not select a higher-stress workout than challenging", () => {
    const ctx = makeCtx({
      goalRace: "marathon",
      level: "advanced",
      phase: "peak",
      weeklyKm: 100,
      weekIndex: 12,
    });

    const comfortable = selectWorkoutRecipe({
      target: "quality",
      ctx,
      daysPerWeek: 6,
      difficultyPreference: "comfortable",
    });
    const challenging = selectWorkoutRecipe({
      target: "quality",
      ctx,
      daysPerWeek: 6,
      difficultyPreference: "challenging",
    });

    expect(comfortable.stressScore).toBeLessThanOrEqual(challenging.stressScore);
  });
});
