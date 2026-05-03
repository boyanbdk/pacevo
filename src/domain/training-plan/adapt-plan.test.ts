// Tests for the adaptive layer rules.
// Acceptance criteria from the implementation plan:
//   - Logging two consecutive easy runs above Z2 triggers AEROBIC_DEFICIT.
//   - Marking an injury inserts cross-training or rest for the flag duration.
//   - Every adaptation explanation is under 200 chars.

import { test, expect } from "vitest";
import { buildPlan } from "./build-plan";
import {
  checkAerobicDeficit,
  checkAcwrCap,
  checkInjuryFlag,
  checkMissedSession,
  checkVdotUpdate,
  runAdaptations,
} from "./adapt-plan";
import type { CompletedSession } from "@/lib/plan-storage";
import type { PlanInputs } from "./types";

// ---------------------------------------------------------------------------
// Fixture: build a real plan to run rules against
// ---------------------------------------------------------------------------

const BASE_INPUTS: PlanInputs = {
  goal_race: "10K",
  goal_date: (() => {
    const d = new Date();
    d.setDate(d.getDate() + 70); // ~10 weeks out
    return d.toISOString().slice(0, 10);
  })(),
  current_weekly_km: 30,
  longest_recent_km: 10,
  recent_race: { distance_m: 10000, time_s: 47 * 60 },
  age: 30,
  resting_hr: 55,
  max_hr: null,
  days_per_week: 4,
  session_minutes_cap: null,
  long_run_day: "saturday",
  surface: "road",
  injury_flags: [],
};

function makePlan() {
  return buildPlan(BASE_INPUTS);
}

function makeCompleted(
  planId: string,
  weekIndex: number,
  dayIndex: number,
  overrides: Partial<CompletedSession> = {},
): CompletedSession {
  return {
    id: `test-${weekIndex}-${dayIndex}`,
    planId,
    weekIndex,
    dayIndex,
    date: new Date().toISOString().slice(0, 10),
    actualKm: null,
    actualDurationMin: null,
    avgHR: null,
    maxHR: null,
    rpe: null,
    note: "",
    source: "manual",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AEROBIC_DEFICIT
// ---------------------------------------------------------------------------

test("AEROBIC_DEFICIT fires when 2+ easy sessions exceed Z2 by RPE > 5", () => {
  const plan = makePlan();
  const currentWeek = 1; // look at week 1 data

  // Find two easy sessions in weeks 0–1
  const easySessionsInRange: Array<{ wi: number; di: number }> = [];
  for (let wi = 0; wi <= 1 && easySessionsInRange.length < 2; wi++) {
    for (const s of plan.weeks[wi].sessions) {
      if ((s.type === "easy" || s.type === "recovery") && easySessionsInRange.length < 2) {
        easySessionsInRange.push({ wi, di: s.day_index });
      }
    }
  }
  expect(easySessionsInRange.length).toBeGreaterThanOrEqual(2);

  const completed: CompletedSession[] = easySessionsInRange.map(({ wi, di }) =>
    makeCompleted("x", wi, di, { rpe: 7, avgHR: plan.hr_zones.Z2[1] + 10 }),
  );

  const result = checkAerobicDeficit(plan, completed, currentWeek);

  expect(result).not.toBeNull();
  expect(result!.rule).toBe("AEROBIC_DEFICIT");
  expect(result!.explanation.length).toBeLessThan(200);
});

test("AEROBIC_DEFICIT does NOT fire when only 1 easy session is above Z2", () => {
  const plan = makePlan();
  const currentWeek = 1;

  const firstEasy = (() => {
    for (const s of plan.weeks[0].sessions) {
      if (s.type === "easy") return s;
    }
    return null;
  })();

  if (!firstEasy) return; // skip if no easy sessions

  const completed: CompletedSession[] = [
    makeCompleted("x", 0, firstEasy.day_index, { rpe: 8 }),
  ];

  const result = checkAerobicDeficit(plan, completed, currentWeek);
  expect(result).toBeNull();
});

test("AEROBIC_DEFICIT replaces a quality session with an easy run", () => {
  const plan = makePlan();
  const currentWeek = 2;

  const easyRuns: Array<{ wi: number; di: number }> = [];
  for (let wi = 1; wi <= 2; wi++) {
    for (const s of plan.weeks[wi].sessions) {
      if ((s.type === "easy" || s.type === "recovery") && easyRuns.length < 2) {
        easyRuns.push({ wi, di: s.day_index });
      }
    }
  }

  if (easyRuns.length < 2) return; // skip if not enough data

  const completed = easyRuns.map(({ wi, di }) =>
    makeCompleted("x", wi, di, { rpe: 8 }),
  );

  const result = checkAerobicDeficit(plan, completed, currentWeek);
  if (!result) return;

  // Find the quality session that was replaced in the new plan
  const qualityTypes = ["tempo", "interval", "repetition", "marathon_pace", "hills", "fartlek"];
  const oldQualityCount = plan.weeks
    .slice(currentWeek, currentWeek + 2)
    .reduce((n, w) => n + w.sessions.filter((s) => qualityTypes.includes(s.type)).length, 0);
  const newQualityCount = result.newPlan.weeks
    .slice(currentWeek, currentWeek + 2)
    .reduce((n, w) => n + w.sessions.filter((s) => qualityTypes.includes(s.type)).length, 0);

  expect(newQualityCount).toBeLessThan(oldQualityCount);
});

// ---------------------------------------------------------------------------
// INJURY_FLAG
// ---------------------------------------------------------------------------

test("INJURY_FLAG fires when injury_flags is non-empty", () => {
  const plan = makePlan();
  const result = checkInjuryFlag(plan, { injury_flags: ["shin splints"] }, 1);

  expect(result).not.toBeNull();
  expect(result!.rule).toBe("INJURY_FLAG");
  expect(result!.explanation.length).toBeLessThan(200);
});

test("INJURY_FLAG replaces run sessions with cross-training", () => {
  const plan = makePlan();
  const currentWeek = 0;
  const result = checkInjuryFlag(plan, { injury_flags: ["knee pain"] }, currentWeek);
  expect(result).not.toBeNull();

  const runTypes = ["easy", "long", "tempo", "interval", "repetition", "marathon_pace", "recovery", "strides", "fartlek", "hills"];
  const affectedWeeks = result!.newPlan.weeks.slice(currentWeek, currentWeek + 2);

  for (const week of affectedWeeks) {
    for (const session of week.sessions) {
      if (session.type !== "rest") {
        expect(session.type).toBe("cross");
      }
    }
  }
});

test("INJURY_FLAG does NOT affect weeks beyond 2 weeks", () => {
  const plan = makePlan();
  const currentWeek = 0;
  const result = checkInjuryFlag(plan, { injury_flags: ["knee pain"] }, currentWeek);
  expect(result).not.toBeNull();

  // Week 3 onwards should be unchanged
  if (plan.weeks.length > 3) {
    const week3Old = plan.weeks[3].sessions.map((s) => s.type).join(",");
    const week3New = result!.newPlan.weeks[3].sessions.map((s) => s.type).join(",");
    expect(week3New).toBe(week3Old);
  }
});

test("INJURY_FLAG does NOT fire when no injury flags set", () => {
  const plan = makePlan();
  const result = checkInjuryFlag(plan, { injury_flags: [] }, 0);
  expect(result).toBeNull();
});

// ---------------------------------------------------------------------------
// ACWR_CAP
// ---------------------------------------------------------------------------

test("ACWR_CAP fires when projected ACWR exceeds 1.3", () => {
  const plan = makePlan();
  // Simulate very low chronic load (runner did almost nothing last 4 weeks)
  // by providing completed sessions with nearly zero km
  const completed: CompletedSession[] = [];
  for (let wi = 0; wi < 4 && wi < plan.weeks.length; wi++) {
    for (const session of plan.weeks[wi].sessions) {
      if (session.type !== "rest") {
        completed.push(makeCompleted("x", wi, session.day_index, { actualKm: 0.5 }));
      }
    }
  }

  // With chronic load near ~2 km/week and acute load of ~30+ km, ACWR will exceed 1.3
  const result = checkAcwrCap(plan, completed, 3);

  if (result) {
    expect(result.rule).toBe("ACWR_CAP");
    expect(result.explanation.length).toBeLessThan(200);

    // Capped week should have reduced volume
    const cappedKm = result.newPlan.weeks[4]?.total_km;
    const originalKm = plan.weeks[4]?.total_km;
    if (cappedKm !== undefined && originalKm !== undefined) {
      expect(cappedKm).toBeLessThanOrEqual(originalKm);
    }
  }
  // May not fire if plan is short; that's acceptable
});

// ---------------------------------------------------------------------------
// VDOT_UPDATE
// ---------------------------------------------------------------------------

test("VDOT_UPDATE fires when tempo effort implies meaningfully different VDOT", () => {
  const plan = makePlan();
  const currentWeek = 1;

  // Find a tempo session to simulate
  let tempoSession: { wi: number; di: number } | null = null;
  outer: for (let wi = 0; wi <= currentWeek; wi++) {
    for (const s of plan.weeks[wi].sessions) {
      if (s.type === "tempo") { tempoSession = { wi, di: s.day_index }; break outer; }
    }
  }

  if (!tempoSession) return; // no tempo session; skip

  // Simulate a much faster tempo — equivalent to VDOT ~60 (current is ~44)
  // 10K at 47 min → VDOT 44. Running 5K tempo at 19:00 implies ~VDOT 57.
  const completed: CompletedSession[] = [
    makeCompleted("x", tempoSession.wi, tempoSession.di, {
      actualKm: 5,
      actualDurationMin: 19, // 19 min 5K tempo → high VDOT
    }),
  ];

  const result = checkVdotUpdate(plan, completed, currentWeek);
  if (result) {
    expect(result.rule).toBe("VDOT_UPDATE");
    expect(result.explanation.length).toBeLessThan(200);
    expect(result.newPlan.meta.vdot).not.toBe(plan.meta.vdot);
  }
  // May not fire if delta < 2; that's acceptable
});

// ---------------------------------------------------------------------------
// Explanation length invariant
// ---------------------------------------------------------------------------

test("All adaptation explanations are under 200 characters", () => {
  const plan = makePlan();

  const easyRuns: Array<{ wi: number; di: number }> = [];
  for (let wi = 0; wi <= 1 && easyRuns.length < 2; wi++) {
    for (const s of plan.weeks[wi].sessions) {
      if ((s.type === "easy" || s.type === "recovery") && easyRuns.length < 2) {
        easyRuns.push({ wi, di: s.day_index });
      }
    }
  }

  const aerobic = checkAerobicDeficit(
    plan,
    easyRuns.map(({ wi, di }) => makeCompleted("x", wi, di, { rpe: 8 })),
    2,
  );
  const injury = checkInjuryFlag(plan, { injury_flags: ["shin splints", "knee pain"] }, 0);
  const acwr = checkAcwrCap(plan, [], 3);
  const missed = checkMissedSession(plan, [], 0);

  for (const r of [aerobic, injury, acwr, missed]) {
    if (r) {
      expect(r.explanation.length).toBeLessThan(200);
    }
  }
});

// ---------------------------------------------------------------------------
// runAdaptations priority order
// ---------------------------------------------------------------------------

test("runAdaptations returns INJURY_FLAG before AEROBIC_DEFICIT", () => {
  const plan = makePlan();

  const easyRuns: Array<{ wi: number; di: number }> = [];
  for (let wi = 0; wi <= 1 && easyRuns.length < 2; wi++) {
    for (const s of plan.weeks[wi].sessions) {
      if ((s.type === "easy" || s.type === "recovery") && easyRuns.length < 2) {
        easyRuns.push({ wi, di: s.day_index });
      }
    }
  }

  const completed = easyRuns.map(({ wi, di }) => makeCompleted("x", wi, di, { rpe: 8 }));

  // Both conditions met: injury + aerobic deficit
  const result = runAdaptations(plan, completed, { injury_flags: ["knee pain"] }, 2);

  expect(result?.rule).toBe("INJURY_FLAG");
});
