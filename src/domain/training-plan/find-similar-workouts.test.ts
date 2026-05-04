import { describe, expect, test } from "vitest";
import { buildPlan } from "./build-plan";
import { findSimilarWorkouts } from "./find-similar-workouts";
import type { PlanInputs, PlannedSession, TrainingPlan } from "./types";

const INPUTS: PlanInputs = {
  goal_race: "half",
  goal_date: "2026-09-12",
  current_weekly_km: 45,
  longest_recent_km: 16,
  recent_race: { distance_m: 10000, time_s: 2820 },
  age: 28,
  resting_hr: 52,
  days_per_week: 5,
  long_run_day: "sunday",
  surface: "road",
  injury_flags: [],
};

function firstSwappableQuality(plan: TrainingPlan): { weekIndex: number; session: PlannedSession } {
  for (let weekIndex = 0; weekIndex < plan.weeks.length; weekIndex++) {
    const session = plan.weeks[weekIndex].sessions.find((candidate) => {
      const options = findSimilarWorkouts(plan, weekIndex, candidate, INPUTS.days_per_week);
      return options.length > 0;
    });
    if (session) return { weekIndex, session };
  }
  throw new Error("No swappable session found in fixture plan.");
}

describe("findSimilarWorkouts", () => {
  test("finds same-stimulus alternatives within load tolerance", () => {
    const plan = buildPlan(INPUTS);
    const { weekIndex, session } = firstSwappableQuality(plan);
    const options = findSimilarWorkouts(plan, weekIndex, session, INPUTS.days_per_week);

    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option.recipe.id).not.toBe(session.recipe_id);
      expect(option.recipe.stimulus).toBe(session.stimulus);
      expect(Math.abs(option.loadDeltaPct)).toBeLessThanOrEqual(10);
      expect(option.session.day_index).toBe(session.day_index);
      expect(option.session.date).toBe(session.date);
      expect(option.session.session_role).toBe(session.session_role);
    }
  });

  test("returns no options for sessions without recipe metadata", () => {
    const plan = buildPlan(INPUTS);
    const session = { ...plan.weeks[0].sessions[0], recipe_id: null, recipe_family: null };

    expect(findSimilarWorkouts(plan, 0, session, INPUTS.days_per_week)).toEqual([]);
  });
});
