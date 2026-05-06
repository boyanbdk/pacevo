// Unit tests for the workout recipe library (Phase 3).
//
// Coverage:
//   - All 4 recovery/easy recipe families produce valid PlannedSession output
//   - All 5 long-run recipe families produce valid output
//   - All 5 tempo recipe families produce valid output
//   - All 7 interval recipe families produce valid output
//   - Recipe builds are deterministic for the same context
//   - Beginner 5K, intermediate half, and advanced marathon get different workouts
//   - No recipe exposes hardcoded "5x1000" as the only interval option
//   - Easy/recovery sessions use hr zone Z1 or Z2
//   - Hard sessions (tempo/interval) use hr zone Z4 or Z5
//   - Cutback long run stays easy at the assigned cutback distance
//   - Stress score constraints are respected

import { test, expect, describe } from "vitest";
import {
  WORKOUT_RECIPES,
  getRecipeById,
  getRecipesByFamily,
  getRecipesBySessionType,
} from "./workout-recipes";
import { formatPace, pacesFromVdot } from "./vdot";
import type { WorkoutContext, Paces } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<WorkoutContext> = {}): WorkoutContext {
  const paces = pacesFromVdot(50); // VDOT 50 — solid intermediate
  return {
    dayIndex: 3,
    date: new Date("2025-06-10"),
    targetKm: 10,
    paces,
    level: "intermediate",
    phase: "build",
    goalRace: "half",
    weeklyKm: 60,
    weekIndex: 5,
    ...overrides,
  };
}

function makePaces(vdot: number): Paces {
  return pacesFromVdot(vdot);
}

// ---------------------------------------------------------------------------
// Registry sanity
// ---------------------------------------------------------------------------

describe("recipe registry", () => {
  test("has at least 21 recipes", () => {
    expect(WORKOUT_RECIPES.length).toBeGreaterThanOrEqual(21);
  });

  test("all recipe ids are unique", () => {
    const ids = WORKOUT_RECIPES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("generated recipe rationales are plain coaching copy", () => {
    const rationales = WORKOUT_RECIPES.map((recipe) => recipe.build(makeCtx()).rationale).join("\n");
    expect(rationales).not.toMatch(/Source:|Daniels|Pfitzinger|Seiler|Hudson|Magness|Higdon/i);
  });

  test("getRecipeById returns correct recipe", () => {
    const r = getRecipeById("easy_run");
    expect(r).toBeDefined();
    expect(r!.family).toBe("easy");
  });

  test("getRecipesByFamily returns only matching family", () => {
    const rs = getRecipesByFamily("tempo_cruise");
    expect(rs.length).toBeGreaterThanOrEqual(1);
    rs.forEach(r => expect(r.family).toBe("tempo_cruise"));
  });

  test("getRecipesBySessionType returns only matching type", () => {
    const rs = getRecipesBySessionType("tempo");
    expect(rs.length).toBeGreaterThanOrEqual(5);
    rs.forEach(r => expect(r.sessionType).toBe("tempo"));
  });
});

// ---------------------------------------------------------------------------
// Recovery & Easy families
// ---------------------------------------------------------------------------

describe("recovery recipes", () => {
  test("recovery_easy_jog builds a valid recovery session", () => {
    const r = getRecipeById("recovery_easy_jog")!;
    const s = r.build(makeCtx({ targetKm: 6 }));
    expect(s.type).toBe("recovery");
    expect(s.hr_zone).toBe("Z1");
    expect(s.target_rpe).toBeLessThanOrEqual(3);
    expect(s.target_km).toBeLessThanOrEqual(6);
    expect(s.main_set).toBeTruthy();
  });

  test("recovery_strides requires intermediate+ level", () => {
    const r = getRecipeById("recovery_strides")!;
    expect(r.levels).not.toContain("beginner");
  });

  test("recovery_strides builds a session with strides in main_set", () => {
    const r = getRecipeById("recovery_strides")!;
    const s = r.build(makeCtx({ level: "intermediate", targetKm: 7 }));
    expect(s.main_set).toContain("strides");
    expect(s.type).toBe("recovery");
  });

  test("easy_run builds a valid easy session", () => {
    const r = getRecipeById("easy_run")!;
    const s = r.build(makeCtx({ targetKm: 10 }));
    expect(s.type).toBe("easy");
    expect(s.hr_zone).toBe("Z2");
    expect(s.pace_low_s_km).toBeLessThan(s.pace_high_s_km!);
  });

  test("easy and recovery structure copy does not prescribe derived easy pace", () => {
    const ctx = makeCtx({ targetKm: 10 });
    const easyLow = formatPace(ctx.paces.E_low);
    const easyHigh = formatPace(ctx.paces.E_high);
    const copy = [
      getRecipeById("recovery_easy_jog")!.build(ctx).main_set,
      getRecipeById("easy_run")!.build(ctx).main_set,
      getRecipeById("long_easy")!.build(ctx).main_set,
      getRecipeById("long_fast_finish")!.build(ctx).main_set,
    ].join("\n");

    expect(copy).not.toContain(easyLow);
    expect(copy).not.toContain(easyHigh);
  });

  test("easy_strides builds session with strides and higher RPE than easy_run", () => {
    const r = getRecipeById("easy_strides")!;
    const s = r.build(makeCtx({ level: "advanced", targetKm: 10 }));
    expect(s.main_set).toContain("strides");
    expect(s.target_rpe).toBeGreaterThan(3);
  });
});

// ---------------------------------------------------------------------------
// Long run families
// ---------------------------------------------------------------------------

describe("long run recipes", () => {
  test("long_easy builds fully easy long run", () => {
    const r = getRecipeById("long_easy")!;
    const s = r.build(makeCtx({ targetKm: 18 }));
    expect(s.type).toBe("long");
    expect(s.hr_zone).toBe("Z2");
    expect(s.target_km).toBe(18);
  });

  test("long_fast_finish finishes at M pace", () => {
    const r = getRecipeById("long_fast_finish")!;
    const ctx = makeCtx({ targetKm: 20, goalRace: "marathon" });
    const s = r.build(ctx);
    expect(s.main_set).toContain("M pace");
    expect(s.type).toBe("long");
  });

  test("long_steady_middle has a three-block structure", () => {
    const r = getRecipeById("long_steady_middle")!;
    const s = r.build(makeCtx({ targetKm: 18 }));
    expect(s.main_set).toContain("→");
  });

  test("long_mp_segment includes marathon pace block", () => {
    const r = getRecipeById("long_mp_segment")!;
    const s = r.build(makeCtx({ targetKm: 22, goalRace: "marathon", level: "advanced", weeklyKm: 80 }));
    expect(s.main_set).toContain("M pace");
    expect(s.type).toBe("marathon_pace");
  });

  test("cutback_long uses the assigned cutback distance", () => {
    const r = getRecipeById("cutback_long")!;
    const s = r.build(makeCtx({ targetKm: 20 }));
    expect(s.target_km!).toBe(20);
    expect(s.target_rpe).toBeLessThanOrEqual(4);
  });

  test("long_fast_finish requires intermediate+ level", () => {
    const r = getRecipeById("long_fast_finish")!;
    expect(r.levels).not.toContain("beginner");
  });
});

// ---------------------------------------------------------------------------
// Tempo families
// ---------------------------------------------------------------------------

describe("tempo recipes", () => {
  test("tempo_continuous uses Z4 and produces a warmup", () => {
    const r = getRecipeById("tempo_continuous")!;
    const s = r.build(makeCtx({ level: "intermediate" }));
    expect(s.hr_zone).toBe("Z4");
    expect(s.warmup).toBeTruthy();
    expect(s.cooldown).toBeTruthy();
    expect(s.main_set).toContain("T pace");
  });

  test("tempo_cruise_intervals has rep structure in main_set", () => {
    const r = getRecipeById("tempo_cruise_intervals")!;
    const s = r.build(makeCtx({ level: "beginner" }));
    expect(s.main_set).toMatch(/\d+×\d+ min/);
  });

  test("tempo_cruise beginner gets fewer reps than advanced", () => {
    const r = getRecipeById("tempo_cruise_intervals")!;
    const beginner = r.build(makeCtx({ level: "beginner" }));
    const advanced = r.build(makeCtx({ level: "advanced" }));
    const begReps = parseInt(beginner.main_set!.match(/^(\d+)×/)![1]);
    const advReps = parseInt(advanced.main_set!.match(/^(\d+)×/)![1]);
    expect(advReps).toBeGreaterThan(begReps);
  });

  test("tempo_progression has three blocks", () => {
    const r = getRecipeById("tempo_progression")!;
    const s = r.build(makeCtx({ level: "intermediate", goalRace: "marathon" }));
    expect(s.main_set).toContain("→");
  });

  test("tempo_ladder uses both T and I pace", () => {
    const r = getRecipeById("tempo_ladder")!;
    const s = r.build(makeCtx({ level: "advanced", goalRace: "10K" }));
    expect(s.main_set).toContain("T");
    expect(s.main_set).toContain("I");
  });

  test("tempo_race_pace is peak/taper only", () => {
    const r = getRecipeById("tempo_race_pace")!;
    expect(r.phases).toContain("peak");
    expect(r.phases).not.toContain("base");
  });
});

// ---------------------------------------------------------------------------
// Interval families
// ---------------------------------------------------------------------------

describe("interval recipes", () => {
  test("interval_12x400 builds short interval session", () => {
    const r = getRecipeById("interval_12x400")!;
    const s = r.build(makeCtx({ level: "advanced", goalRace: "5K" }));
    expect(s.hr_zone).toBe("Z5");
    expect(s.main_set).toContain("400 m");
    expect(s.main_set).toContain("I pace");
  });

  test("interval_6x800 builds medium interval session", () => {
    const r = getRecipeById("interval_6x800")!;
    const s = r.build(makeCtx({ level: "intermediate" }));
    expect(s.main_set).toContain("800 m");
    expect(s.hr_zone).toBe("Z5");
  });

  test("interval_5x1000 builds long interval session", () => {
    const r = getRecipeById("interval_5x1000")!;
    const s = r.build(makeCtx({ level: "intermediate" }));
    expect(s.main_set).toContain("1000 m");
  });

  test("interval_4x1200 requires advanced level", () => {
    const r = getRecipeById("interval_4x1200")!;
    expect(r.levels).toEqual(["advanced"]);
    expect(r.minWeeklyKm).toBeGreaterThanOrEqual(70);
  });

  test("hills_8x60s uses RPE-based intensity not pace target", () => {
    const r = getRecipeById("hills_8x60s")!;
    const s = r.build(makeCtx({ level: "intermediate", goalRace: "10K" }));
    expect(s.type).toBe("hills");
    expect(s.main_set).toContain("uphill");
  });

  test("fartlek_8x1min is accessible to beginners", () => {
    const r = getRecipeById("fartlek_8x1min")!;
    expect(r.levels).toContain("beginner");
    const s = r.build(makeCtx({ level: "beginner", weeklyKm: 25 }));
    expect(s.type).toBe("fartlek");
    expect(s.main_set).toContain("surges");
  });

  test("interval_beginner_400 is beginner-only", () => {
    const r = getRecipeById("interval_beginner_400")!;
    expect(r.levels).toEqual(["beginner"]);
  });

  test("interval families include short, medium, long, vo2, hills, and fartlek", () => {
    const families = getRecipesBySessionType("interval").map(r => r.family);
    expect(families).toContain("interval_short");
    expect(families).toContain("interval_medium");
    expect(families).toContain("interval_long");
    expect(families).toContain("interval_vo2");
    expect(families).toContain("hills");
    expect(families).toContain("fartlek");
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("recipe determinism", () => {
  test("same context produces identical output across two calls", () => {
    const r = getRecipeById("interval_5x1000")!;
    const ctx = makeCtx({ level: "intermediate", goalRace: "half", weeklyKm: 60 });
    const a = r.build(ctx);
    const b = r.build(ctx);
    expect(a).toEqual(b);
  });

  test("tempo_continuous same context twice produces same main_set", () => {
    const r = getRecipeById("tempo_continuous")!;
    const ctx = makeCtx();
    expect(r.build(ctx).main_set).toBe(r.build(ctx).main_set);
  });
});

// ---------------------------------------------------------------------------
// Level differentiation
// ---------------------------------------------------------------------------

describe("level differentiation", () => {
  test("beginner 5K gets accessible interval recipe (fartlek or beginner_400)", () => {
    const intervalRecipes = WORKOUT_RECIPES.filter(
      r => r.sessionType === "interval"
        && r.levels.includes("beginner")
        && r.goalRaces.includes("5K")
    );
    expect(intervalRecipes.length).toBeGreaterThanOrEqual(1);
  });

  test("advanced marathon gets vo2 interval recipe", () => {
    const r = getRecipeById("interval_4x1200")!;
    expect(r.levels).toContain("advanced");
    expect(r.goalRaces).toContain("marathon");
  });

  test("intermediate half gets long_mp_segment recipe", () => {
    const r = getRecipeById("long_mp_segment")!;
    expect(r.levels).toContain("intermediate");
    expect(r.goalRaces).toContain("half");
  });
});

// ---------------------------------------------------------------------------
// Stress score ordering
// ---------------------------------------------------------------------------

describe("stress scores", () => {
  test("recovery_easy_jog has lowest stress score of 1", () => {
    const r = getRecipeById("recovery_easy_jog")!;
    expect(r.stressScore).toBe(1);
  });

  test("interval_4x1200 has highest stress score of 5", () => {
    const r = getRecipeById("interval_4x1200")!;
    expect(r.stressScore).toBe(5);
  });

  test("all long run recipes have stressScore >= 1", () => {
    const rs = getRecipesBySessionType("long");
    rs.forEach(r => expect(r.stressScore).toBeGreaterThanOrEqual(1));
  });

  test("recovery recipes all have stressScore <= 2", () => {
    const rs = getRecipesBySessionType("recovery");
    rs.forEach(r => expect(r.stressScore).toBeLessThanOrEqual(2));
  });
});
