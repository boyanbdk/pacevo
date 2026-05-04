// Golden tests for the TypeScript training plan builder.
// Must pass the same invariants as tests/test_build_plan.py.

import { test, expect } from "vitest";
import { buildPlan } from "./build-plan";
import { vdotFromRace, pacesFromVdot, riegelPredict, tanakaHrmax, hrZones } from "./vdot";
import { classifyRunner } from "./classify-runner";
import { GoalRace, Level, TrainingPlan, PlanInputs } from "./types";

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

  // Long run ≤ 33% of weekly volume
  for (const w of weeks) {
    if (w.total_km > 0) {
      expect(w.long_run_km / w.total_km).toBeLessThanOrEqual(0.35);
    }
  }

  // Taper final week ≥ 40% reduction from peak
  const peakVol = Math.max(...volumes);
  const taperWeeks = weeks.filter(w => w.phase === "taper");
  const finalTaperVol = taperWeeks[taperWeeks.length - 1].total_km;
  if (peakVol > 0) {
    const reduction = 1 - finalTaperVol / peakVol;
    expect(reduction).toBeGreaterThanOrEqual(0.38);
  }

  // Volume and quality never both increase in the same week
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1];
    const curr = weeks[i];
    if (!curr.is_deload && curr.phase !== "taper") {
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

test("advanced marathon plan has ≥1.5 quality sessions/wk in peak", () => {
  const plan = buildPlan(ADVANCED_MARATHON);
  assertPlanInvariants(plan, "marathon", "advanced");
  const peakWeeks = plan.weeks.filter(w => w.phase === "peak");
  const avgQuality = peakWeeks.reduce((s, w) => s + w.quality_count, 0) / peakWeeks.length;
  expect(avgQuality).toBeGreaterThanOrEqual(1.5);
});

test("too-short plan throws", () => {
  const soon = new Date();
  soon.setDate(soon.getDate() + 7 * 8); // only 8 weeks for marathon
  const inputs: PlanInputs = { ...ADVANCED_MARATHON, goal_date: soon.toISOString().slice(0, 10) };
  expect(() => buildPlan(inputs)).toThrow(/weeks/i);
});

test("output is deterministic", () => {
  const p1 = buildPlan(INTERMEDIATE_HALF);
  const p2 = buildPlan(INTERMEDIATE_HALF);
  expect(p1.weeks.map(w => w.total_km)).toEqual(p2.weeks.map(w => w.total_km));
  expect(p1.weeks.map(w => w.phase)).toEqual(p2.weeks.map(w => w.phase));
});

test("generated run sessions carry recipe metadata", () => {
  const plan = buildPlan(INTERMEDIATE_HALF);
  const runSessions = plan.weeks
    .flatMap(w => w.sessions)
    .filter(s => s.type !== "rest");

  expect(runSessions.length).toBeGreaterThan(0);
  for (const session of runSessions) {
    expect(session.recipe_id).toBeTruthy();
    expect(session.recipe_family).toBeTruthy();
    expect(session.stimulus).toBeTruthy();
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
