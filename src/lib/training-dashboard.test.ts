import { expect, test } from "vitest";
import type { SavedWorkout } from "../domain/workout-schema";
import type { SavedPlan } from "./plan-storage";
import {
  completedKmForWeek,
  currentWeekIndex,
  latestFeedbackNeeded,
  nextLongRun,
  nextRun,
  planStatus,
  preferenceSignal,
  recentActivity,
  stravaActivityItems,
  weeksRemaining,
} from "./training-dashboard";

function session(dayIndex: number, date: string, type: "easy" | "long" | "rest", km: number | null) {
  return {
    day_index: dayIndex,
    date,
    type,
    session_role: type === "rest" ? "rest" : type === "long" ? "long" : "easy",
    recipe_id: type === "rest" ? null : `${type}_recipe`,
    recipe_family: type === "long" ? "long_easy" : type === "easy" ? "easy" : null,
    stimulus: type === "rest" ? null : "aerobic",
    target_km: km,
    target_duration_min: null,
    pace_low_s_km: null,
    pace_high_s_km: null,
    hr_zone: type === "rest" ? null : "Z2",
    target_rpe: type === "rest" ? null : 4,
    description: type,
    rationale: "Test session",
    warmup: null,
    main_set: null,
    cooldown: null,
  } as const;
}

function plan(overrides: Partial<SavedPlan> = {}): SavedPlan {
  const base: SavedPlan = {
    id: "plan-1",
    inputs: {
      goal_race: "10K",
      goal_date: "2026-06-15",
      current_weekly_km: 30,
      longest_recent_km: 10,
      recent_race: null,
      age: 30,
      days_per_week: 4,
    },
    plan: {
      meta: {
        goal_race: "10K",
        goal_date: "2026-06-15",
        level: "intermediate",
        inferred_level: "intermediate",
        weeks_total: 2,
        start_date: "2026-05-04",
        vdot: 44,
        vdot_source: "race",
        peak_weekly_km: 40,
        hrmax: 190,
        generated_at: "2026-05-01T00:00:00.000Z",
        intensity_mode: "pace",
        training_focus: "balanced",
        volume_preference: "steady",
        difficulty_preference: "balanced",
      },
      paces: { E_low: 360, E_high: 390, M: 330, T: 300, I: 280, R: 250 },
      hr_zones: {
        Z1: [95, 114],
        Z2: [114, 133],
        Z3: [133, 152],
        Z4: [152, 171],
        Z5: [171, 190],
      },
      weeks: [
        {
          week_index: 0,
          phase: "base",
          is_deload: false,
          total_km: 20,
          long_run_km: 8,
          quality_count: 0,
          acwr: null,
          sessions: [
            session(1, "2026-05-04", "easy", 5),
            session(2, "2026-05-05", "rest", null),
            session(3, "2026-05-06", "easy", 7),
            session(6, "2026-05-09", "long", 8),
          ],
        },
        {
          week_index: 1,
          phase: "build",
          is_deload: false,
          total_km: 24,
          long_run_km: 10,
          quality_count: 1,
          acwr: 1.1,
          sessions: [
            session(1, "2026-05-11", "easy", 6),
            session(3, "2026-05-13", "easy", 8),
            session(6, "2026-05-16", "long", 10),
          ],
        },
      ],
      warnings: [],
    },
    status: "active",
    versions: [{
      versionIndex: 0,
      reason: "initial",
      plan: {} as SavedPlan["plan"],
      createdAt: "2026-05-01T00:00:00.000Z",
    }],
    completedSessions: [],
    adaptationEvents: [],
    workoutFeedback: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };

  base.versions[0].plan = base.plan;
  return { ...base, ...overrides };
}

test("dashboard date helpers compute current week and weeks remaining deterministically", () => {
  const saved = plan();

  expect(currentWeekIndex(saved, new Date(2026, 4, 4))).toBe(0);
  expect(currentWeekIndex(saved, new Date(2026, 4, 12))).toBe(1);
  expect(weeksRemaining(saved, new Date(2026, 4, 4))).toBe(6);
});

test("nextRun skips past and logged sessions while nextLongRun keeps the plan priority visible", () => {
  const saved = plan({
    completedSessions: [{
      id: "done-1",
      planId: "plan-1",
      weekIndex: 0,
      dayIndex: 3,
      date: "2026-05-06",
      actualKm: 7,
      actualDurationMin: 42,
      avgHR: null,
      maxHR: null,
      rpe: 4,
      note: "",
      source: "manual",
      createdAt: "2026-05-06T10:00:00.000Z",
    }],
  });

  expect(nextRun(saved, new Date(2026, 4, 6))?.session.day_index).toBe(6);
  expect(nextLongRun(saved, 0, new Date(2026, 4, 6))?.session.target_km).toBe(8);
});

test("planStatus distinguishes missed sessions, adaptations, and on-track weeks", () => {
  expect(planStatus(plan(), 0, new Date(2026, 4, 7))).toMatchObject({
    label: "Needs attention",
    tone: "warn",
  });

  const adapted = plan({
    completedSessions: [{
      id: "done-1",
      planId: "plan-1",
      weekIndex: 0,
      dayIndex: 1,
      date: "2026-05-04",
      actualKm: 5,
      actualDurationMin: 30,
      avgHR: null,
      maxHR: null,
      rpe: 4,
      note: "",
      source: "manual",
      createdAt: "2026-05-04T10:00:00.000Z",
    }],
    adaptationEvents: [{
      id: "adapt-1",
      planId: "plan-1",
      firedAt: "2026-05-05T10:00:00.000Z",
      rule: "PREFERENCE_REPLAN",
      explanation: "Future workouts adjusted from feedback.",
      triggeredBySessionIds: [],
      newVersionIndex: 1,
    }],
  });
  expect(planStatus(adapted, 0, new Date(2026, 4, 5))).toMatchObject({
    label: "Adapted this week",
    tone: "info",
  });

  expect(planStatus(plan(), 0, new Date(2026, 4, 4))).toMatchObject({
    label: "On track",
    tone: "ok",
  });
});

test("dashboard feedback and progress helpers surface useful signals", () => {
  const completed = {
    id: "done-1",
    planId: "plan-1",
    weekIndex: 0,
    dayIndex: 1,
    date: "2026-05-04",
    actualKm: 5,
    actualDurationMin: 30,
    avgHR: null,
    maxHR: null,
    rpe: 4,
    note: "",
    source: "manual" as const,
    createdAt: "2026-05-04T10:00:00.000Z",
  };
  const saved = plan({ completedSessions: [completed] });

  expect(completedKmForWeek(saved, 0)).toBe(5);
  expect(latestFeedbackNeeded(saved)).toBe(completed);
  expect(preferenceSignal(saved)).toBe("No preferences learned yet");

  const withFeedback = plan({
    completedSessions: [completed],
    workoutFeedback: [{
      id: "feedback-1",
      planId: "plan-1",
      sessionId: "0-1",
      recipeId: "easy_recipe",
      recipeFamily: "easy",
      type: "favourite",
      createdAt: "2026-05-04T11:00:00.000Z",
    }],
  });

  expect(latestFeedbackNeeded(withFeedback)).toBeNull();
  expect(preferenceSignal(withFeedback)).toBe("easy");
});

test("recentActivity merges logs, adaptations, swaps, and one-off workouts newest first", () => {
  const workout: SavedWorkout = {
    id: "workout-1",
    title: "800 m repeats",
    sourceType: "text",
    sourceText: "",
    parsedWorkout: { title: "800 m repeats", activityType: "running", sourceSummary: "", steps: [], uncertaintyFlags: [] },
    adjustments: [],
    createdAt: "2026-05-07T10:00:00.000Z",
    updatedAt: "2026-05-07T10:00:00.000Z",
  };
  const saved = plan({
    completedSessions: [{
      id: "done-1",
      planId: "plan-1",
      weekIndex: 0,
      dayIndex: 1,
      date: "2026-05-04",
      actualKm: 5,
      actualDurationMin: 30,
      avgHR: null,
      maxHR: null,
      rpe: 4,
      note: "",
      source: "file_import",
      createdAt: "2026-05-04T10:00:00.000Z",
    }],
    adaptationEvents: [{
      id: "adapt-1",
      planId: "plan-1",
      firedAt: "2026-05-06T10:00:00.000Z",
      rule: "PREFERENCE_REPLAN",
      explanation: "Future workouts adjusted from feedback.",
      triggeredBySessionIds: [],
      newVersionIndex: 1,
    }],
    versions: [
      { versionIndex: 0, reason: "initial", plan: {} as SavedPlan["plan"], createdAt: "2026-05-01T00:00:00.000Z" },
      {
        versionIndex: 1,
        reason: "swap",
        plan: {} as SavedPlan["plan"],
        createdAt: "2026-05-05T10:00:00.000Z",
        swapSessionId: "0-3",
        swapFromRecipeId: "tempo_20min",
        swapToRecipeId: "tempo_cruise",
      },
    ],
  });

  const activity = recentActivity(saved, [workout]);

  expect(activity.map((item) => item.label)).toEqual([
    "One-off workout",
    "Preference replan",
    "Workout swapped",
    "Imported run",
  ]);
  expect(activity[2].href).toBe("/app/plans/plan-1/sessions/0-3");
});

test("stravaActivityItems link to activity detail pages instead of the plan", () => {
  const saved = plan();

  const [item] = stravaActivityItems(saved, [{
    id: "strava:12345",
    providerActivityId: "12345",
    source: "strava",
    fileName: "Strava",
    name: "Morning Run",
    startedAt: "2026-05-07T06:00:00.000Z",
    date: "2026-05-07",
    distanceKm: 6.2,
    durationMin: 34,
    avgHR: 145,
    maxHR: null,
  }]);

  expect(item.href).toBe("/app/activities/strava/12345");
});

test("stravaActivityItems hide activities already imported by provider id", () => {
  const saved = plan({
    completedSessions: [{
      id: "done-1",
      planId: "plan-1",
      weekIndex: 0,
      dayIndex: 1,
      date: "2026-05-04",
      actualKm: 5,
      actualDurationMin: 30,
      avgHR: null,
      maxHR: null,
      rpe: 4,
      note: "",
      source: "strava",
      providerActivityId: "12345",
      createdAt: "2026-05-04T10:00:00.000Z",
    }],
  });

  const items = stravaActivityItems(saved, [{
    id: "strava:12345",
    providerActivityId: "12345",
    source: "strava",
    fileName: "Strava",
    name: "Morning Run",
    startedAt: "2026-05-07T06:00:00.000Z",
    date: "2026-05-07",
    distanceKm: 6.2,
    durationMin: 34,
    avgHR: 145,
    maxHR: null,
  }]);

  expect(items).toEqual([]);
});
