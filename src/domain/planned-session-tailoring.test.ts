import { describe, expect, it } from "vitest";
import { plannedSessionToParsedWorkout, plannedSessionToWorkoutText } from "./planned-session-tailoring";
import type { PlannedSession } from "./training-plan/types";

function plannedSession(overrides: Partial<PlannedSession> = {}): PlannedSession {
  return {
    day_index: 2,
    date: "2026-05-06",
    type: "interval",
    session_role: "quality",
    recipe_id: "interval_medium",
    recipe_family: "interval_medium",
    stimulus: "vo2max",
    target_km: 8,
    target_duration_min: null,
    pace_low_s_km: 230,
    pace_high_s_km: 240,
    hr_zone: "Z4-Z5",
    target_rpe: 8,
    description: "800 m repeats",
    rationale: "Builds VO2max while keeping recovery controlled.",
    warmup: "10 min easy jog",
    main_set: "6×800 m at I pace (3:55 /km) with 90 s walk recovery",
    cooldown: "5-10 min easy jog",
    ...overrides,
  };
}

describe("planned session tailoring", () => {
  it("hydrates a planned interval session into parser steps", () => {
    const parsed = plannedSessionToParsedWorkout(plannedSession());

    expect(parsed.title).toBe("800 m repeats");
    expect(parsed.steps).toMatchObject([
      { type: "warmup", durationSeconds: 600 },
      { type: "interval", reps: 6, distanceKm: 0.8, targetPace: "3:55", restSeconds: 90 },
      { type: "cooldown", durationSeconds: 300 },
    ]);
    expect(parsed.uncertaintyFlags).toEqual([]);
  });

  it("falls back to the planned target distance for simple runs", () => {
    const parsed = plannedSessionToParsedWorkout(plannedSession({
      type: "easy",
      description: "Easy aerobic run",
      warmup: null,
      main_set: "Easy at conversational effort",
      cooldown: null,
      target_km: 7,
    }));

    expect(parsed.steps).toMatchObject([{ type: "run", distanceKm: 7 }]);
  });

  it("keeps the source text tied to the plan structure", () => {
    const text = plannedSessionToWorkoutText(plannedSession());

    expect(text).toContain("Warm-up: 10 min easy jog");
    expect(text).toContain("Main set: 6×800 m");
    expect(text).toContain("Cool-down: 5-10 min easy jog");
  });
});
