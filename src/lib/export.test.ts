import { describe, expect, test } from "vitest";
import type { PlannedSession, TrainingPlan } from "@/domain/training-plan/types";
import { defaultSettings } from "./storage";
import { planPaceReference, sessionPaceForExport } from "./export";

const EASY_SESSION: PlannedSession = {
  day_index: 2,
  date: "2026-05-06",
  type: "easy",
  session_role: "easy",
  recipe_id: "easy_run",
  recipe_family: "easy",
  stimulus: "aerobic",
  target_km: 7,
  target_duration_min: null,
  pace_low_s_km: 317,
  pace_high_s_km: 355,
  hr_zone: "Z2",
  target_rpe: 4,
  description: "Easy aerobic run",
  rationale: "Build aerobic volume.",
  warmup: null,
  main_set: "7.0 km easy at conversational effort, Z1-Z2",
  cooldown: null,
};

const TEMPO_SESSION: PlannedSession = {
  ...EASY_SESSION,
  type: "tempo",
  session_role: "quality",
  target_rpe: 7,
  pace_low_s_km: 265,
  pace_high_s_km: 265,
  description: "Tempo run",
};

const PLAN: TrainingPlan = {
  meta: {
    goal_race: "10K",
    goal_date: "2026-07-04",
    level: "intermediate",
    inferred_level: "intermediate",
    weeks_total: 8,
    start_date: "2026-05-04",
    vdot: 45,
    vdot_source: "race",
    peak_weekly_km: 45,
    hrmax: 186,
    generated_at: "2026-05-04T00:00:00.000Z",
    intensity_mode: "hr",
    training_focus: "balanced",
    volume_preference: "steady",
    difficulty_preference: "balanced",
  },
  paces: {
    E_low: 317,
    E_high: 355,
    M: 285,
    T: 265,
    I: 245,
    R: 225,
  },
  hr_zones: {
    Z1: [95, 113],
    Z2: [114, 132],
    Z3: [133, 151],
    Z4: [152, 170],
    Z5: [171, 189],
  },
  weeks: [],
  warnings: [],
};

describe("plan export pace helpers", () => {
  test("easy sessions export no derived pace by default", () => {
    expect(sessionPaceForExport(EASY_SESSION, defaultSettings)).toBe("");
  });

  test("easy sessions export user settings only when enabled", () => {
    expect(sessionPaceForExport(EASY_SESSION, {
      ...defaultSettings,
      defaultEasyPace: "6:40",
      showEasyRunPaceTargets: true,
    })).toBe("6:40/km");
  });

  test("hard sessions still export generated hard paces", () => {
    expect(sessionPaceForExport(TEMPO_SESSION, defaultSettings)).toBe("4:25/km");
  });

  test("plan pace reference labels settings and never says derived easy", () => {
    const text = planPaceReference(PLAN, {
      ...defaultSettings,
      defaultEasyPace: "6:40",
      defaultCooldownPace: "7:05",
    });

    expect(text).toContain("Easy setting: 6:40/km");
    expect(text).toContain("Recovery setting: 7:05/km");
    expect(text).not.toContain("5:17");
    expect(text).not.toContain("/km easy");
  });
});
