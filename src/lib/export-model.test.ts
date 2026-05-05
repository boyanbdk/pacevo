import { describe, expect, test } from "vitest";
import type { PlannedSession, TrainingPlan } from "@/domain/training-plan/types";
import { defaultSettings } from "./storage";
import {
  buildPlanExportModel,
  planPaceReferenceText,
  sessionPaceForExport,
} from "./export-model";

function session(overrides: Partial<PlannedSession>): PlannedSession {
  return {
    day_index: 1,
    date: "2026-05-04",
    type: "easy",
    session_role: "easy",
    recipe_id: "easy_run",
    recipe_family: "easy",
    stimulus: "aerobic",
    target_km: 8,
    target_duration_min: null,
    pace_low_s_km: 317,
    pace_high_s_km: 355,
    hr_zone: "Z2",
    target_rpe: 4,
    description: "Easy aerobic run",
    rationale: "Build aerobic volume.",
    warmup: null,
    main_set: "8.0 km easy",
    cooldown: null,
    ...overrides,
  };
}

const PLAN: TrainingPlan = {
  meta: {
    goal_race: "10K",
    goal_date: "2026-07-04",
    level: "intermediate",
    inferred_level: "intermediate",
    weeks_total: 2,
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
  weeks: [
    {
      week_index: 0,
      phase: "base",
      is_deload: false,
      total_km: 45,
      long_run_km: 14,
      quality_count: 1,
      sessions: [
        session({ day_index: 1, date: "2026-05-04", type: "hills", pace_low_s_km: 237, description: "Hill repeats" }),
        session({ day_index: 2, date: "2026-05-05", type: "easy" }),
        session({ day_index: 7, date: "2026-05-10", type: "rest", session_role: "rest", target_km: null, pace_low_s_km: null, pace_high_s_km: null, description: "Rest day" }),
      ],
    },
    {
      week_index: 1,
      phase: "build",
      is_deload: true,
      total_km: 38,
      long_run_km: 12,
      quality_count: 0,
      sessions: [
        session({ day_index: 1, date: "2026-05-11", type: "long", target_km: 12, pace_low_s_km: 330, description: "Cutback long run" }),
      ],
    },
  ],
  warnings: ["Keep easy days easy."],
};

describe("plan export model", () => {
  test("keeps Week 1 and preserves rest days", () => {
    const model = buildPlanExportModel(PLAN, defaultSettings);

    expect(model.weeks[0].number).toBe(1);
    expect(model.weeks[0].dateRange).toBe("May 4 - May 10");
    expect(model.weeks[0].sessions.map((session) => session.label)).toEqual([
      "Hills",
      "Easy",
      "Rest",
    ]);
    expect(model.weeks[0].sessions.at(-1)?.isRest).toBe(true);
  });

  test("labels deload weeks and long runs", () => {
    const model = buildPlanExportModel(PLAN, defaultSettings);

    expect(model.weeks[1].label).toBe("Build · Deload");
    expect(model.weeks[1].sessions[0].label).toBe("Long run");
    expect(model.weeks[1].longRunDistance).toBe("12.0 km");
  });

  test("easy sessions export no derived pace by default", () => {
    expect(sessionPaceForExport(session({ type: "easy" }), defaultSettings)).toBe("");
  });

  test("easy sessions export user settings only when enabled", () => {
    expect(sessionPaceForExport(session({ type: "easy" }), {
      ...defaultSettings,
      defaultEasyPace: "6:40",
      showEasyRunPaceTargets: true,
    })).toBe("6:40/km");
  });

  test("hard sessions still export generated hard paces", () => {
    expect(sessionPaceForExport(session({ type: "tempo", pace_low_s_km: 265 }), defaultSettings)).toBe("4:25/km");
  });

  test("pace reference labels settings and never says derived easy", () => {
    const text = planPaceReferenceText(PLAN, {
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
