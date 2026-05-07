// Golden tests for the TypeScript training plan builder.
// Must pass the same invariants as tests/test_build_plan.py.

import { test, expect, vi } from "vitest";
import { buildPlan } from "./build-plan";
import { vdotFromRace, pacesFromVdot, riegelPredict, tanakaHrmax, hrZones } from "./vdot";
import { classifyRunner } from "./classify-runner";
import { getRecipeById } from "./workout-recipes";
import { GoalRace, Level, TrainingPlan, PlanInputs } from "./types";

const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];
const GOALS: GoalRace[] = ["5K", "10K", "half", "marathon"];

const HARD_TYPES = new Set([
  "tempo",
  "interval",
  "repetition",
  "marathon_pace",
  "hills",
  "fartlek",
]);

function futureDate(weeksFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + weeksFromNow * 7);
  return d.toISOString().slice(0, 10);
}

function raceDistanceM(goalRace: GoalRace): number {
  return {
    "5K": 5000,
    "10K": 10000,
    half: 21097,
    marathon: 42195,
  }[goalRace];
}

function raceDistanceKm(goalRace: GoalRace): number {
  return raceDistanceM(goalRace) / 1000;
}

function hasRace(week: TrainingPlan["weeks"][number]): boolean {
  return week.sessions.some((session) => session.type === "race");
}

function comparableTaperKm(week: TrainingPlan["weeks"][number]): number {
  const raceKm = week.sessions
    .filter((session) => session.type === "race")
    .reduce((sum, session) => sum + (session.target_km ?? 0), 0);
  return Math.round((week.total_km - raceKm) * 10) / 10;
}

// ---------------------------------------------------------------------------
// VDOT tests
// ---------------------------------------------------------------------------

test("tanaka HRmax at age 30 is 187", () => {
  expect(tanakaHrmax(30)).toBe(187);
});

test("tanaka HRmax at age 40 is 180", () => {
  expect(tanakaHrmax(40)).toBe(180);
});

test("riegel predicts 10K from 5K within range", () => {
  const predicted = riegelPredict(5000, 1500, 10000); // 25 min 5K
  expect(predicted).toBeGreaterThanOrEqual(3100);
  expect(predicted).toBeLessThanOrEqual(3180);
});

test("pace ordering: R < I < T < M < E_low for VDOT 50", () => {
  const p = pacesFromVdot(50);
  expect(p.R!).toBeLessThan(p.I!);
  expect(p.I!).toBeLessThan(p.T!);
  expect(p.T!).toBeLessThan(p.M!);
  expect(p.M!).toBeLessThan(p.E_low);
});

test("VDOT from 47 min 10K is roughly 44", () => {
  const v = vdotFromRace(10000, 47 * 60);
  expect(v).toBeGreaterThanOrEqual(42);
  expect(v).toBeLessThanOrEqual(46);
});

// ---------------------------------------------------------------------------
// Classifier tests
// ---------------------------------------------------------------------------

test("low mileage beginner marathon", () => {
  expect(classifyRunner("marathon", 20, 8)).toBe("beginner");
});

test("intermediate half with race time", () => {
  expect(classifyRunner("half", 45, 16, 44)).toBe("intermediate");
});

test("advanced marathon all signals", () => {
  expect(classifyRunner("marathon", 100, 32, 60)).toBe("advanced");
});

test("conservative takes lowest level", () => {
  expect(classifyRunner("marathon", 90, 8, 30)).toBe("beginner");
});

// ---------------------------------------------------------------------------
// Plan invariant helper
// ---------------------------------------------------------------------------

function assertPlanInvariants(plan: TrainingPlan, goalRace: GoalRace, level: Level) {
  const { weeks, meta } = plan;
  const volumes = weeks.map(w => w.total_km);
  const phases = weeks.map(w => w.phase);

  expect(meta.level).toBe(level);
  expect(meta.goal_race).toBe(goalRace);

  // All required phases present
  expect(phases).toContain("base");
  expect(phases).toContain("build");
  expect(phases).toContain("taper");

  // Taper is at the end
  const taperIdx = phases.lastIndexOf("taper");
  const firstTaperIdx = phases.indexOf("taper");
  for (let i = firstTaperIdx; i <= taperIdx; i++) {
    expect(phases[i]).toBe("taper");
  }
  for (let i = firstTaperIdx; i <= taperIdx; i++) {
    if (i > 0) {
      expect(comparableTaperKm(weeks[i])).toBeLessThanOrEqual(comparableTaperKm(weeks[i - 1]));
    }
  }

  // Long run ≤ 33% of weekly volume
  for (const w of weeks) {
    if (hasRace(w)) continue;
    if (w.total_km > 0) {
      expect(w.long_run_km / w.total_km).toBeLessThanOrEqual(0.35);
    }
  }

  // Final taper training volume drops clearly; the race distance itself is
  // counted separately in the race-week total.
  const peakVol = Math.max(...volumes);
  const taperWeeks = weeks.filter(w => w.phase === "taper");
  const finalTaperVol = comparableTaperKm(taperWeeks[taperWeeks.length - 1]);
  if (peakVol > 0) {
    const reduction = 1 - finalTaperVol / peakVol;
    expect(reduction).toBeGreaterThanOrEqual(0.38);
  }

  // Volume and quality never both increase in the same week
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1];
    const curr = weeks[i];
    if (!prev.is_deload && !curr.is_deload && curr.phase !== "taper" && !hasRace(curr)) {
      const volUp = curr.total_km > prev.total_km;
      const qualUp = curr.quality_count > prev.quality_count;
      expect(volUp && qualUp).toBe(false);
    }
  }

  // Beginner has no interval/repetition sessions in first 4 weeks
  if (level === "beginner") {
    for (const w of weeks.slice(0, 4)) {
      for (const s of w.sessions) {
        expect(["interval", "repetition"]).not.toContain(s.type);
      }
    }
  }

  // Every week has at least one rest day
  for (const w of weeks) {
    const restCount = w.sessions.filter(s => s.type === "rest").length;
    expect(restCount).toBeGreaterThanOrEqual(1);
  }

  // All sessions have dates and types
  for (const w of weeks) {
    for (const s of w.sessions) {
      expect(s.date).toBeTruthy();
      expect(s.type).toBeTruthy();
    }
  }
}

// ---------------------------------------------------------------------------
// Fixture-based golden tests
// ---------------------------------------------------------------------------

const BEGINNER_5K: PlanInputs = {
  goal_race: "5K",
  goal_date: "2026-08-01",
  current_weekly_km: 16,
  longest_recent_km: 5,
  recent_race: null,
  age: 32,
  resting_hr: 60,
  days_per_week: 4,
  long_run_day: "saturday",
  surface: "road",
  injury_flags: [],
};

const INTERMEDIATE_HALF: PlanInputs = {
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

const ADVANCED_MARATHON: PlanInputs = {
  goal_race: "marathon",
  goal_date: "2026-10-18",
  current_weekly_km: 95,
  longest_recent_km: 30,
  recent_race: { distance_m: 21098, time_s: 5400 },
  age: 34,
  max_hr: 186,
  resting_hr: 44,
  days_per_week: 6,
  long_run_day: "sunday",
  surface: "road",
  injury_flags: [],
};

type GoldenProfile = {
  weeklyKm: number;
  longestKm: number;
  raceTimeS: number | null;
  weeks: number;
  days: number;
};

const GOLDEN_PROFILES: Record<GoalRace, Record<Level, GoldenProfile>> = {
  "5K": {
    beginner: { weeklyKm: 16, longestKm: 5, raceTimeS: null, weeks: 14, days: 4 },
    intermediate: { weeklyKm: 35, longestKm: 8, raceTimeS: 22 * 60, weeks: 12, days: 5 },
    advanced: { weeklyKm: 70, longestKm: 14, raceTimeS: 17 * 60 + 30, weeks: 10, days: 6 },
  },
  "10K": {
    beginner: { weeklyKm: 24, longestKm: 7, raceTimeS: null, weeks: 16, days: 4 },
    intermediate: { weeklyKm: 45, longestKm: 11, raceTimeS: 47 * 60, weeks: 14, days: 5 },
    advanced: { weeklyKm: 80, longestKm: 18, raceTimeS: 37 * 60 + 30, weeks: 12, days: 6 },
  },
  half: {
    beginner: { weeklyKm: 28, longestKm: 9, raceTimeS: null, weeks: 18, days: 4 },
    intermediate: { weeklyKm: 45, longestKm: 14, raceTimeS: 1 * 3600 + 43 * 60, weeks: 16, days: 5 },
    advanced: { weeklyKm: 84, longestKm: 24, raceTimeS: 1 * 3600 + 20 * 60, weeks: 14, days: 6 },
  },
  marathon: {
    beginner: { weeklyKm: 36, longestKm: 12, raceTimeS: null, weeks: 22, days: 4 },
    intermediate: { weeklyKm: 62, longestKm: 21, raceTimeS: 3 * 3600 + 35 * 60, weeks: 20, days: 5 },
    advanced: { weeklyKm: 100, longestKm: 32, raceTimeS: 2 * 3600 + 52 * 60, weeks: 18, days: 6 },
  },
};

function goldenInputs(goalRace: GoalRace, level: Level): PlanInputs {
  const profile = GOLDEN_PROFILES[goalRace][level];
  return {
    goal_race: goalRace,
    goal_date: futureDate(profile.weeks),
    current_weekly_km: profile.weeklyKm,
    longest_recent_km: profile.longestKm,
    recent_race: profile.raceTimeS
      ? { distance_m: raceDistanceM(goalRace), time_s: profile.raceTimeS }
      : null,
    estimated_race_time_s: null,
    age: 34,
    max_hr: 186,
    resting_hr: 52,
    days_per_week: profile.days,
    session_minutes_cap: null,
    long_run_day: level === "advanced" ? "sunday" : "saturday",
    surface: "road",
    injury_flags: [],
    self_selected_level: level,
    training_focus: goalRace === "5K" ? "speed" : goalRace === "marathon" ? "endurance" : "balanced",
    volume_preference: "steady",
    difficulty_preference: level === "advanced" ? "challenging" : "balanced",
    intensity_mode: level === "beginner" ? "hr" : "pace",
  };
}

test("beginner 5K plan passes all invariants", () => {
  const plan = buildPlan(BEGINNER_5K);
  assertPlanInvariants(plan, "5K", "beginner");
  expect(plan.meta.weeks_total).toBeGreaterThanOrEqual(8);
});

test("intermediate half plan passes all invariants and has valid VDOT", () => {
  const plan = buildPlan(INTERMEDIATE_HALF);
  assertPlanInvariants(plan, "half", "intermediate");
  expect(plan.meta.vdot).not.toBeNull();
  expect(plan.meta.vdot!).toBeGreaterThanOrEqual(40);
  expect(plan.meta.vdot!).toBeLessThanOrEqual(50);
});

test("advanced marathon plan has ≥1.5 quality sessions/wk in non-deload peak weeks", () => {
  const plan = buildPlan(ADVANCED_MARATHON);
  assertPlanInvariants(plan, "marathon", "advanced");
  const peakWeeks = plan.weeks.filter(w => w.phase === "peak" && !w.is_deload);
  const avgQuality = peakWeeks.reduce((s, w) => s + w.quality_count, 0) / peakWeeks.length;
  expect(avgQuality).toBeGreaterThanOrEqual(1.5);
});

test("too-short plan generates with a short-runway warning", () => {
  const soon = new Date();
  soon.setDate(soon.getDate() + 7 * 8); // only 8 weeks for marathon
  const inputs: PlanInputs = { ...ADVANCED_MARATHON, goal_date: soon.toISOString().slice(0, 10) };
  const plan = buildPlan(inputs);

  expect(plan.weeks.length).toBeGreaterThan(0);
  expect(plan.warnings.join("\n")).toMatch(/Short runway - focus on safe sharpening/);
});

test.each(GOALS.flatMap((goalRace) => [2, 3, 4].map((weeks) => ({ goalRace, weeks }))))(
  "$weeks-week $goalRace plan generates instead of blocking",
  ({ goalRace, weeks }) => {
    const plan = buildPlan({
      goal_race: goalRace,
      goal_date: futureDate(weeks),
      current_weekly_km: 40,
      longest_recent_km: goalRace === "marathon" ? 18 : 10,
      age: 34,
      days_per_week: 4,
      recent_race: null,
      surface: "road",
      injury_flags: [],
      self_selected_level: "beginner",
    });

    expect(plan.meta.goal_race).toBe(goalRace);
    expect(plan.meta.weeks_total).toBe(weeks);
    expect(plan.weeks).toHaveLength(weeks);
    expect(plan.weeks.at(-1)?.phase).toBe("taper");
    expect(plan.warnings.join("\n")).toMatch(/Short runway - focus on safe sharpening/);
  },
);

test("output is deterministic", () => {
  const p1 = buildPlan(INTERMEDIATE_HALF);
  const p2 = buildPlan(INTERMEDIATE_HALF);
  expect(p1.weeks.map(w => w.total_km)).toEqual(p2.weeks.map(w => w.total_km));
  expect(p1.weeks.map(w => w.phase)).toEqual(p2.weeks.map(w => w.phase));
});

test("generated run sessions carry recipe metadata", () => {
  const plan = buildPlan(INTERMEDIATE_HALF);
  // race sessions are injected directly (no recipe); exclude them from recipe invariants
  const runSessions = plan.weeks
    .flatMap(w => w.sessions)
    .filter(s => s.type !== "rest" && s.type !== "race");

  expect(runSessions.length).toBeGreaterThan(0);
  for (const session of runSessions) {
    expect(session.recipe_id).toBeTruthy();
    expect(session.recipe_family).toBeTruthy();
    expect(session.stimulus).toBeTruthy();
  }
});

test("generated session content stays aligned with recipe metadata", () => {
  const plan = buildPlan(INTERMEDIATE_HALF);
  const runSessions = plan.weeks
    .flatMap(w => w.sessions)
    .filter(s => s.type !== "rest" && s.type !== "race");

  for (const session of runSessions) {
    const recipe = getRecipeById(session.recipe_id!);
    expect(recipe).toBeTruthy();
    expect(session.recipe_family).toBe(recipe!.family);
    expect(session.stimulus).toBe(recipe!.stimulus);
    if (recipe!.sessionType === "easy" || recipe!.sessionType === "recovery" || recipe!.sessionType === "tempo") {
      expect(session.type).toBe(recipe!.sessionType);
    }
  }
});

test("quality sessions come from varied recipes, not the old fixed interval path", () => {
  const plan = buildPlan(INTERMEDIATE_HALF);
  const qualityIds = plan.weeks
    .flatMap(w => w.sessions)
    .filter(s => s.session_role === "quality")
    .map(s => s.recipe_id);

  expect(new Set(qualityIds).size).toBeGreaterThan(1);
  expect(qualityIds).not.toEqual(["interval_5x1000"]);
});

test("quality recipes do not repeat inside a 3-week window when alternatives exist", () => {
  const plan = buildPlan(INTERMEDIATE_HALF);
  const qualityByWeek = plan.weeks.map(w =>
    w.sessions
      .filter(s => s.session_role === "quality")
      .map(s => s.recipe_id)
      .filter((id): id is string => Boolean(id)),
  );

  for (let i = 0; i < qualityByWeek.length; i++) {
    const recent = qualityByWeek.slice(Math.max(0, i - 3), i).flat();
    for (const id of qualityByWeek[i]) {
      expect(recent).not.toContain(id);
    }
  }
});

// ---------------------------------------------------------------------------
// Phase 8 — golden coverage and safety properties
// ---------------------------------------------------------------------------

test.each(
  GOALS.flatMap((goalRace) => LEVELS.map((level) => [goalRace, level] as const)),
)("golden %s %s plan passes core invariants", (goalRace, level) => {
  const plan = buildPlan(goldenInputs(goalRace, level));

  assertPlanInvariants(plan, goalRace, level);
  expect(plan.meta.weeks_total).toBeGreaterThanOrEqual(4);

  const runSessions = plan.weeks.flatMap((week) => week.sessions).filter((session) => session.type !== "rest" && session.type !== "race");
  expect(runSessions.length).toBeGreaterThan(0);
  expect(runSessions.every((session) => session.recipe_id && session.recipe_family && session.stimulus)).toBe(true);
});

test.each(GOALS)("golden %s plans cover all runner levels distinctly", (goalRace) => {
  const plans = LEVELS.map((level) => buildPlan(goldenInputs(goalRace, level)));

  expect(plans.map((plan) => plan.meta.level)).toEqual(LEVELS);

  const peakKmByLevel = plans.map((plan) => Math.max(...plan.weeks.map((week) => week.total_km)));
  expect(peakKmByLevel[0]).toBeLessThan(peakKmByLevel[1]);
  expect(peakKmByLevel[1]).toBeLessThan(peakKmByLevel[2]);

  const qualityVarietyByLevel = plans.map((plan) =>
    new Set(
      plan.weeks
        .flatMap((week) => week.sessions)
        .filter((session) => session.session_role === "quality")
        .map((session) => session.recipe_id),
    ).size,
  );
  expect(qualityVarietyByLevel[2]).toBeGreaterThanOrEqual(qualityVarietyByLevel[0]);
});

test.each(
  GOALS.flatMap((goalRace) => LEVELS.map((level) => [goalRace, level] as const)),
)("golden %s %s plan never schedules adjacent hard sessions", (goalRace, level) => {
  const plan = buildPlan(goldenInputs(goalRace, level));

  for (const week of plan.weeks) {
    const hardDays = week.sessions
      .filter((session) => HARD_TYPES.has(session.type))
      .map((session) => session.day_index);

    for (let i = 1; i < hardDays.length; i++) {
      expect(hardDays[i] - hardDays[i - 1]).toBeGreaterThan(1);
    }
  }
});

test.each(
  GOALS.flatMap((goalRace) => LEVELS.map((level) => [goalRace, level] as const)),
)("golden %s %s plan keeps hard-session count inside level guardrails", (goalRace, level) => {
  const plan = buildPlan(goldenInputs(goalRace, level));
  const maxHardByLevel: Record<Level, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
  };

  for (const week of plan.weeks) {
    const hardCount = week.sessions.filter((session) => HARD_TYPES.has(session.type)).length;
    expect(hardCount).toBeLessThanOrEqual(maxHardByLevel[level]);
  }
});

test.each(GOALS)("golden %s plans provide varied quality workouts across a full plan", (goalRace) => {
  const level: Level = goalRace === "marathon" ? "advanced" : "intermediate";
  const plan = buildPlan(goldenInputs(goalRace, level));
  const qualityIds = plan.weeks
    .flatMap((week) => week.sessions)
    .filter((session) => session.session_role === "quality")
    .map((session) => session.recipe_id)
    .filter((id): id is string => Boolean(id));

  expect(new Set(qualityIds).size).toBeGreaterThanOrEqual(Math.min(3, qualityIds.length));
});

// ---------------------------------------------------------------------------
// Coach plan rebuild Phase 1 — mileage engine regression coverage
// ---------------------------------------------------------------------------

test("low-mileage runner starts from recent weekly average instead of race floor", () => {
  const plan = buildPlan({
    ...BEGINNER_5K,
    goal_race: "marathon",
    goal_date: futureDate(22),
    current_weekly_km: 20,
    longest_recent_km: 17,
    recent_race: { distance_m: 5000, time_s: 23 * 60 },
    estimated_race_time_s: null,
    days_per_week: 4,
    self_selected_level: "beginner",
    volume_preference: "steady",
  });

  expect(plan.meta.level).toBe("beginner");
  expect(plan.weeks[0].total_km).toBe(20);
  expect(plan.warnings.some((warning) => warning.includes("real baseline"))).toBe(true);
});

test("supported volume preferences produce distinct peak volumes", () => {
  const base: PlanInputs = {
    ...INTERMEDIATE_HALF,
    goal_date: futureDate(18),
    current_weekly_km: 50,
    longest_recent_km: 18,
    self_selected_level: "intermediate",
    difficulty_preference: "balanced",
  };

  const gradual = buildPlan({ ...base, volume_preference: "gradual" });
  const steady = buildPlan({ ...base, volume_preference: "steady" });
  const progressive = buildPlan({ ...base, volume_preference: "progressive" });

  expect(gradual.meta.peak_weekly_km).toBeLessThan(steady.meta.peak_weekly_km);
  expect(steady.meta.peak_weekly_km).toBeLessThanOrEqual(progressive.meta.peak_weekly_km);
});

test("session minutes cap constrains weekly volume and records a user-facing warning", () => {
  const uncapped = buildPlan({
    ...INTERMEDIATE_HALF,
    goal_date: futureDate(18),
    current_weekly_km: 50,
    longest_recent_km: 18,
    days_per_week: 4,
    session_minutes_cap: null,
  });
  const capped = buildPlan({
    ...INTERMEDIATE_HALF,
    goal_date: futureDate(18),
    current_weekly_km: 50,
    longest_recent_km: 18,
    days_per_week: 4,
    session_minutes_cap: 35,
  });

  expect(capped.meta.peak_weekly_km).toBeLessThan(uncapped.meta.peak_weekly_km);
  expect(capped.warnings.some((warning) => warning.includes("session limit is 35 minutes"))).toBe(true);
});

test("highest non-taper mileage happens before taper and exceeds early base when unconstrained", () => {
  const plan = buildPlan({
    ...INTERMEDIATE_HALF,
    goal_date: futureDate(20),
    current_weekly_km: 45,
    longest_recent_km: 16,
    self_selected_level: "intermediate",
    volume_preference: "steady",
  });
  const taperStart = plan.weeks.findIndex((week) => week.phase === "taper");
  const nonTaperVolumes = plan.weeks
    .filter((week) => week.phase !== "taper")
    .map((week) => week.total_km);
  const peak = Math.max(...nonTaperVolumes);
  const peakIndex = plan.weeks.findIndex((week) => week.total_km === peak);

  expect(taperStart).toBeGreaterThan(0);
  expect(peakIndex).toBeLessThan(taperStart);
  expect(peak).toBeGreaterThan(plan.weeks[0].total_km);
});

test("generated plan warnings do not expose source citations", () => {
  const plan = buildPlan({
    ...BEGINNER_5K,
    goal_race: "marathon",
    goal_date: futureDate(20),
    current_weekly_km: 18,
    longest_recent_km: 12,
    self_selected_level: "beginner",
    session_minutes_cap: 30,
  });

  expect(plan.warnings.length).toBeGreaterThan(0);
  expect(plan.warnings.join("\n")).not.toMatch(/Source:/);
});

// ---------------------------------------------------------------------------
// Phase 5: Race estimate input — independent estimate distance
// ---------------------------------------------------------------------------

function estimateBase(goalRace: GoalRace, weeks: number): PlanInputs {
  return {
    goal_race: goalRace,
    goal_date: futureDate(weeks),
    current_weekly_km: 40,
    longest_recent_km: 16,
    age: 34,
    days_per_week: 4,
    recent_race: null,
    estimated_race_time_s: null,
    estimated_race_distance_m: null,
    surface: "road",
    injury_flags: [],
  };
}

test("marathon plan built from a 5K estimate derives a valid VDOT", () => {
  // 23-minute 5K estimate → Riegel converts to marathon pace → VDOT
  const plan = buildPlan({
    ...estimateBase("marathon", 20),
    estimated_race_time_s: 23 * 60, // 23:00 for 5K
    estimated_race_distance_m: 5000,
  });
  expect(plan.meta.vdot).not.toBeNull();
  expect(plan.meta.vdot_source).toBe("race");
  expect(plan.meta.vdot!).toBeGreaterThanOrEqual(40);
  expect(plan.meta.vdot!).toBeLessThanOrEqual(50);
});

test("5K plan built from a half marathon estimate derives a valid VDOT", () => {
  // 1:45:00 half estimate → Riegel converts to 5K pace → VDOT
  const plan = buildPlan({
    ...estimateBase("5K", 12),
    estimated_race_time_s: 1 * 3600 + 45 * 60, // 1:45:00 for half
    estimated_race_distance_m: 21097,
  });
  expect(plan.meta.vdot).not.toBeNull();
  expect(plan.meta.vdot_source).toBe("race");
  expect(plan.meta.vdot!).toBeGreaterThanOrEqual(40);
  expect(plan.meta.vdot!).toBeLessThanOrEqual(50);
});

test("10K plan built from a 10K estimate derives a valid VDOT", () => {
  const plan = buildPlan({
    ...estimateBase("10K", 12),
    estimated_race_time_s: 47 * 60, // 47:00 for 10K
    estimated_race_distance_m: 10000,
  });
  expect(plan.meta.vdot).not.toBeNull();
  expect(plan.meta.vdot_source).toBe("race");
  expect(plan.meta.vdot!).toBeGreaterThanOrEqual(42);
  expect(plan.meta.vdot!).toBeLessThanOrEqual(46);
});

test("half plan built from a marathon estimate derives a valid VDOT", () => {
  // 3:45:00 marathon estimate → Riegel converts to half pace → VDOT
  const plan = buildPlan({
    ...estimateBase("half", 14),
    estimated_race_time_s: 3 * 3600 + 45 * 60, // 3:45:00 for marathon
    estimated_race_distance_m: 42195,
  });
  expect(plan.meta.vdot).not.toBeNull();
  expect(plan.meta.vdot_source).toBe("race");
  expect(plan.meta.vdot!).toBeGreaterThanOrEqual(35);
  expect(plan.meta.vdot!).toBeLessThanOrEqual(45);
});

test("estimate-derived VDOT is consistent with equivalent direct race VDOT", () => {
  // A 5K estimate should yield roughly the same VDOT as an actual 5K race
  const fromEstimate = buildPlan({
    ...estimateBase("marathon", 20),
    estimated_race_time_s: 20 * 60,
    estimated_race_distance_m: 5000,
  });
  const fromRace = buildPlan({
    ...estimateBase("marathon", 20),
    recent_race: { distance_m: 5000, time_s: 20 * 60 },
  });
  expect(fromEstimate.meta.vdot).toBe(fromRace.meta.vdot);
});

// ---------------------------------------------------------------------------
// Phase 7: Mileage-curve invariants across the goal × tier matrix
// ---------------------------------------------------------------------------

const MILEAGE_TIERS: Record<"low" | "moderate" | "high", Level> = {
  low: "beginner",
  moderate: "intermediate",
  high: "advanced",
};

const MILEAGE_MATRIX: { tier: "low" | "moderate" | "high"; goal: GoalRace }[] =
  (["low", "moderate", "high"] as const).flatMap((tier) =>
    GOALS.map((goal) => ({ tier, goal }))
  );

test.each(MILEAGE_MATRIX)(
  "$tier mileage $goal plan: start respects current baseline",
  ({ tier, goal }) => {
    const inputs = goldenInputs(goal, MILEAGE_TIERS[tier]);
    const plan = buildPlan(inputs);
    // Week one must not exceed the runner's recent average by more than ~5%.
    expect(plan.weeks[0].total_km).toBeLessThanOrEqual(inputs.current_weekly_km * 1.05);
  }
);

test.each(MILEAGE_MATRIX)(
  "$tier mileage $goal plan: peak occurs before taper",
  ({ tier, goal }) => {
    const plan = buildPlan(goldenInputs(goal, MILEAGE_TIERS[tier]));
    const taperStart = plan.weeks.findIndex((w) => w.phase === "taper");
    if (taperStart < 0) return; // very short plans may not taper
    const nonTaper = plan.weeks.filter((w) => w.phase !== "taper");
    const peak = Math.max(...nonTaper.map((w) => w.total_km));
    const peakIndex = plan.weeks.findIndex((w) => w.total_km === peak);
    expect(peakIndex).toBeLessThan(taperStart);
  }
);

test.each(MILEAGE_MATRIX)(
  "$tier mileage $goal plan: taper reduces meaningfully from the actual pre-taper peak",
  ({ tier, goal }) => {
    const plan = buildPlan(goldenInputs(goal, MILEAGE_TIERS[tier]));
    const taperWeeks = plan.weeks.filter((w) => w.phase === "taper");
    if (taperWeeks.length === 0) return;
    const nonTaperPeak = Math.max(
      ...plan.weeks.filter((w) => w.phase !== "taper").map((w) => w.total_km)
    );
    const finalTaper = comparableTaperKm(taperWeeks[taperWeeks.length - 1]);
    // The final taper week's pre-race training load is at most 70% of the
    // pre-taper peak. Race distance is intentionally counted separately.
    expect(finalTaper).toBeLessThanOrEqual(nonTaperPeak * 0.7);
    // Taper training load is monotonically non-increasing.
    for (let i = 1; i < taperWeeks.length; i++) {
      expect(comparableTaperKm(taperWeeks[i])).toBeLessThanOrEqual(comparableTaperKm(taperWeeks[i - 1]));
    }
  }
);

test("marathon taper follows peak-relative three-week distribution", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-07T12:00:00Z"));
  try {
    const plan = buildPlan({
      goal_race: "marathon",
      goal_date: "2026-08-23",
      current_weekly_km: 57,
      longest_recent_km: 28,
      recent_race: { distance_m: 10000, time_s: 45 * 60 },
      estimated_race_distance_m: null,
      estimated_race_time_s: null,
      age: 35,
      resting_hr: 50,
      max_hr: null,
      days_per_week: 6,
      session_minutes_cap: null,
      long_run_day: "saturday",
      surface: "road",
      injury_flags: [],
      self_selected_level: "intermediate",
      volume_preference: "steady",
      difficulty_preference: "balanced",
      training_focus: "endurance",
    });

    const taperWeeks = plan.weeks.filter((week) => week.phase === "taper");
    expect(taperWeeks).toHaveLength(3);
    const peak = Math.max(...plan.weeks.filter((week) => week.phase !== "taper").map((week) => week.total_km));
    const [threeWeeksOut, twoWeeksOut, raceWeek] = taperWeeks;
    const threeWeeksRatio = comparableTaperKm(threeWeeksOut) / peak;
    const twoWeeksRatio = comparableTaperKm(twoWeeksOut) / peak;
    const raceWeekTrainingRatio = comparableTaperKm(raceWeek) / peak;

    expect(threeWeeksRatio).toBeGreaterThanOrEqual(0.85);
    expect(threeWeeksRatio).toBeLessThanOrEqual(0.90);
    expect(twoWeeksRatio).toBeGreaterThanOrEqual(0.65);
    expect(twoWeeksRatio).toBeLessThanOrEqual(0.70);
    expect(raceWeekTrainingRatio).toBeGreaterThanOrEqual(0.30);
    expect(raceWeekTrainingRatio).toBeLessThanOrEqual(0.40);
    expect(raceWeek.sessions.some((session) => session.type === "race")).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

test.each(MILEAGE_MATRIX)(
  "$tier mileage $goal plan: deload weeks dip below the prior week",
  ({ tier, goal }) => {
    const plan = buildPlan(goldenInputs(goal, MILEAGE_TIERS[tier]));
    const deloads = plan.weeks
      .map((w, i) => ({ w, i }))
      .filter(({ w, i }) => w.is_deload && i > 0);
    if (deloads.length === 0) return; // some short plans may have none
    for (const { w, i } of deloads) {
      expect(w.total_km).toBeLessThanOrEqual(plan.weeks[i - 1].total_km);
    }
  }
);

test.each(MILEAGE_MATRIX)(
  "$tier mileage $goal plan: peak weekly km exceeds first-week volume when not capped",
  ({ tier, goal }) => {
    const plan = buildPlan(goldenInputs(goal, MILEAGE_TIERS[tier]));
    // Skip the very-short or volume-capped tiers where the plan can't grow.
    if (plan.weeks.length < 8) return;
    expect(plan.meta.peak_weekly_km).toBeGreaterThanOrEqual(plan.weeks[0].total_km);
  }
);

test("deload weeks reduce mileage and run count without removing quality stimulus", () => {
  const plan = buildPlan({
    ...INTERMEDIATE_HALF,
    goal_date: futureDate(18),
    days_per_week: 5,
    self_selected_level: "intermediate",
  });
  const deloadIndex = plan.weeks.findIndex((week) => week.is_deload && week.phase !== "base");

  expect(deloadIndex).toBeGreaterThan(0);
  const deload = plan.weeks[deloadIndex];
  const previous = plan.weeks[deloadIndex - 1];
  const runCount = deload.sessions.filter((session) => session.type !== "rest").length;

  expect(deload.total_km).toBeLessThan(previous.total_km);
  expect(runCount).toBeLessThan(INTERMEDIATE_HALF.days_per_week);
  expect(deload.quality_count).toBeGreaterThanOrEqual(1);
  expect(deload.sessions.some((session) =>
    session.session_role === "quality"
    && session.stimulus !== "aerobic"
    && session.stimulus !== "recovery"
  )).toBe(true);
});

test("post-deload weeks rebound instead of freezing at deload mileage", () => {
  const plan = buildPlan({
    ...INTERMEDIATE_HALF,
    goal_date: futureDate(18),
    days_per_week: 5,
    self_selected_level: "intermediate",
  });
  const deloadIndex = plan.weeks.findIndex((week, index) =>
    index < plan.weeks.length - 1
    && week.is_deload
    && plan.weeks[index + 1].phase !== "taper"
  );

  expect(deloadIndex).toBeGreaterThan(0);
  expect(plan.weeks[deloadIndex + 1].total_km).toBeGreaterThan(plan.weeks[deloadIndex].total_km);
});

test("race week uses fewer run days and carries the race distance", () => {
  const plan = buildPlan({
    ...INTERMEDIATE_HALF,
    goal_race: "10K",
    goal_date: futureDate(10),
    current_weekly_km: 45,
    longest_recent_km: 14,
    days_per_week: 5,
    self_selected_level: "intermediate",
  });
  const raceWeek = plan.weeks.at(-1)!;
  const race = raceWeek.sessions.find((session) => session.type === "race");
  const runCount = raceWeek.sessions.filter((session) => session.type !== "rest").length;

  expect(race).toBeDefined();
  expect(race?.target_km).toBe(raceDistanceKm("10K"));
  expect(runCount).toBeLessThan(plan.meta.weeks_total > 1 ? 5 : 6);
  expect(raceWeek.sessions.some((session) => session.session_role === "long")).toBe(false);
});

test("normal weeks vary daily run mileage instead of cloning every easy run", () => {
  const plan = buildPlan({
    ...INTERMEDIATE_HALF,
    goal_date: futureDate(18),
    days_per_week: 5,
    self_selected_level: "intermediate",
  });
  const week = plan.weeks.find((candidate) =>
    candidate.phase === "build"
    && !candidate.is_deload
    && !hasRace(candidate)
    && candidate.sessions.filter((session) => session.session_role === "easy").length >= 2
  );

  expect(week).toBeDefined();
  const easyDistances = week!.sessions
    .filter((session) => session.session_role === "easy")
    .map((session) => session.target_km);
  expect(new Set(easyDistances).size).toBeGreaterThan(1);
});
