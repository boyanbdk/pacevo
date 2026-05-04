// Training plan builder.
// Volume, phase, and guardrail constants mirror scripts/build_plan.py; workout
// sessions are generated through the TypeScript recipe selector.

import {
  GoalRace, Level, Phase, PlanInputs, TrainingPlan, TrainingWeek,
  PlannedSession, Paces, WorkoutContext, WorkoutRecipe,
} from "./types";
import { vdotFromRace, pacesFromVdot, riegelPredict, tanakaHrmax, hrZones } from "./vdot";
import { classifyRunner, resolveSafeLevel } from "./classify-runner";
import { selectWorkoutRecipe } from "./select-workout-recipe";

// ---------------------------------------------------------------------------
// Constants (same values as build_plan.py, same source citations)
// ---------------------------------------------------------------------------

const FLOOR_KM: Record<GoalRace, Record<Level, number>> = {
  "5K":       { beginner: 15, intermediate: 30, advanced: 50 },
  "10K":      { beginner: 20, intermediate: 40, advanced: 70 },
  "half":     { beginner: 25, intermediate: 40, advanced: 70 },
  "marathon": { beginner: 30, intermediate: 50, advanced: 90 },
};

const PEAK_KM: Record<GoalRace, Record<Level, number>> = {
  "5K":       { beginner: 35, intermediate: 60,  advanced: 95  },
  "10K":      { beginner: 48, intermediate: 78,  advanced: 115 },
  "half":     { beginner: 52, intermediate: 78,  advanced: 125 },
  "marathon": { beginner: 62, intermediate: 97,  advanced: 160 },
};

const LONG_RUN_CAP_KM: Record<GoalRace, number> = {
  "5K": 12, "10K": 16, "half": 22, "marathon": 35,
};

const PROGRESSION_RATE: Record<Level, number> = {
  beginner: 0.07, intermediate: 0.09, advanced: 0.11,
};

const DELOAD_EVERY_N_WEEKS = 4;
const DELOAD_FACTOR = 0.75;
const TAPER_VOLUME_FACTOR = 0.50;

const TAPER_WEEKS: Record<GoalRace, number> = {
  "5K": 1, "10K": 1, "half": 2, "marathon": 3,
};

const QUALITY_COUNT: Record<Phase, Record<Level, number>> = {
  base:  { beginner: 0, intermediate: 1, advanced: 1 },
  build: { beginner: 1, intermediate: 2, advanced: 2 },
  peak:  { beginner: 1, intermediate: 2, advanced: 3 },
  taper: { beginner: 0, intermediate: 1, advanced: 1 },
};

const MAX_HARD_SESSIONS: Record<Level, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

const MIN_WEEKS: Record<GoalRace, Record<Level, number>> = {
  "5K":       { beginner: 8,  intermediate: 6,  advanced: 4  },
  "10K":      { beginner: 10, intermediate: 8,  advanced: 6  },
  "half":     { beginner: 12, intermediate: 10, advanced: 8  },
  "marathon": { beginner: 16, intermediate: 14, advanced: 12 },
};

const DAY_NAMES = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nextMonday(from: Date): Date {
  const d = new Date(from);
  const dow = d.getDay(); // 0=Sun
  const daysUntilMonday = dow === 1 ? 0 : (8 - dow) % 7 || 7;
  return addDays(d, daysUntilMonday);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Phase split
// ---------------------------------------------------------------------------

function splitPhases(weeksTotal: number, taperWeeks: number): Phase[] {
  const remaining = weeksTotal - taperWeeks;
  let peakWeeks = Math.max(1, Math.round(0.20 * weeksTotal));
  let buildWeeks = Math.max(1, Math.round(0.40 * weeksTotal));
  let baseWeeks = Math.max(1, remaining - peakWeeks - buildWeeks);

  while (baseWeeks + buildWeeks + peakWeeks > remaining) {
    if (buildWeeks > 1) buildWeeks--;
    else if (baseWeeks > 1) baseWeeks--;
    else peakWeeks--;
  }

  const phases: Phase[] = [
    ...Array(baseWeeks).fill("base" as Phase),
    ...Array(buildWeeks).fill("build" as Phase),
    ...Array(peakWeeks).fill("peak" as Phase),
    ...Array(taperWeeks).fill("taper" as Phase),
  ];

  while (phases.length < weeksTotal) {
    phases.splice(phases.length - taperWeeks, 0, "build");
  }

  return phases.slice(0, weeksTotal);
}

// ---------------------------------------------------------------------------
// Volume curve
// ---------------------------------------------------------------------------

function buildVolumeCurve(
  startKm: number,
  peakKm: number,
  weeksTotal: number,
  level: Level,
  phases: Phase[],
): number[] {
  const taperStart = phases.indexOf("taper");
  const effectiveTaperStart = taperStart === -1 ? weeksTotal : taperStart;
  const taperCount = weeksTotal - effectiveTaperStart;

  // Pre-compute actual peak from non-taper progression
  let current = startKm;
  let loadWkCount = 0;
  let actualPeak = startKm;
  for (let i = 0; i < effectiveTaperStart; i++) {
    loadWkCount++;
    if (loadWkCount % DELOAD_EVERY_N_WEEKS === 0) {
      current = round1(current * DELOAD_FACTOR);
    } else {
      current = round1(Math.min(current * (1 + PROGRESSION_RATE[level]), peakKm));
    }
    if (current > actualPeak) actualPeak = current;
  }

  // Build full curve
  current = startKm;
  loadWkCount = 0;
  const volumes: number[] = [];

  for (let i = 0; i < weeksTotal; i++) {
    const phase = phases[i];
    if (phase === "taper") {
      const taperIndex = i - effectiveTaperStart;
      let vol: number;
      if (taperCount === 1) {
        vol = round1(actualPeak * TAPER_VOLUME_FACTOR);
      } else {
        const frac = 1.0 - (taperIndex / (taperCount - 1)) * (1.0 - TAPER_VOLUME_FACTOR);
        vol = round1(actualPeak * frac);
      }
      const previous = volumes.at(-1);
      if (previous !== undefined) {
        vol = Math.min(vol, previous);
      }
      volumes.push(vol);
    } else {
      loadWkCount++;
      if (loadWkCount % DELOAD_EVERY_N_WEEKS === 0) {
        current = round1(current * DELOAD_FACTOR);
      } else {
        current = round1(Math.min(current * (1 + PROGRESSION_RATE[level]), peakKm));
      }
      volumes.push(current);
    }
  }

  return volumes;
}

// ---------------------------------------------------------------------------
// Session layout
// ---------------------------------------------------------------------------

const REST_DESCRIPTION = "Full rest day. No running.";
const REST_RATIONALE = "Rest is when adaptation happens. At least 1 rest day per week is mandatory.";

function dayIndex(dayName: string): number {
  return DAY_NAMES.indexOf(dayName.toLowerCase()) + 1;
}

function restSession(di: number, d: Date): PlannedSession {
  return {
    day_index: di,
    date: isoDate(d),
    type: "rest",
    session_role: "rest",
    target_km: null,
    target_duration_min: null,
    pace_low_s_km: null,
    pace_high_s_km: null,
    hr_zone: null,
    target_rpe: null,
    description: REST_DESCRIPTION,
    rationale: REST_RATIONALE,
    warmup: null,
    main_set: null,
    cooldown: null,
  };
}

function scaleWeekVolume(week: TrainingWeek, nextTotalKm: number): void {
  if (week.total_km <= 0 || nextTotalKm >= week.total_km) return;
  const scaleFactor = nextTotalKm / week.total_km;

  week.total_km = round1(nextTotalKm);
  week.long_run_km = round1(week.long_run_km * scaleFactor);

  for (const session of week.sessions) {
    if (session.target_km) {
      session.target_km = round1(session.target_km * scaleFactor);
    }
    if (session.target_duration_min) {
      session.target_duration_min = Math.max(1, Math.round(session.target_duration_min * scaleFactor));
    }
  }
}

function buildRecipeSession(
  recipe: WorkoutRecipe,
  ctx: WorkoutContext,
  role: PlannedSession["session_role"],
): PlannedSession {
  return {
    ...recipe.build(ctx),
    session_role: role,
    recipe_id: recipe.id,
    recipe_family: recipe.family,
    stimulus: recipe.stimulus,
  };
}

function layoutWeek(
  weekIndex: number,
  weekStart: Date,
  totalKm: number,
  longRunKm: number,
  phase: Phase,
  level: Level,
  goalRace: GoalRace,
  isDeload: boolean,
  daysPerWeek: number,
  longRunDay: string,
  paces: Paces,
  trainingFocus: PlanInputs["training_focus"],
  difficultyPreference: PlanInputs["difficulty_preference"],
  recentQualityRecipeIds: string[],
): PlannedSession[] {
  const longDayIdx = dayIndex(longRunDay);
  let qualityCount = isDeload ? 0 : QUALITY_COUNT[phase][level];
  // Beginners: no I/R sessions in first 4 weeks
  if (level === "beginner" && weekIndex <= 4) {
    qualityCount = 0;
  }

  const restAfterLong = (longDayIdx % 7) + 1;
  const dayBeforeLong = longDayIdx === 1 ? 7 : longDayIdx - 1;
  const usedDays = new Set([longDayIdx, restAfterLong]);

  const qDays: number[] = [];
  for (let d = 1; d <= 7 && qDays.length < qualityCount; d++) {
    if (
      !usedDays.has(d)
      && d !== dayBeforeLong
      && !qDays.some(q => Math.abs(d - q) <= 1)
    ) {
      qDays.push(d);
      usedDays.add(d);
    }
  }

  qualityCount = qDays.length;
  const easyDays = Math.max(0, daysPerWeek - 1 - qualityCount);
  const easyKm = round1((totalKm - longRunKm) / Math.max(easyDays + qualityCount, 1));

  const eDays: number[] = [];
  for (let d = 1; d <= 7 && eDays.length < easyDays; d++) {
    if (!usedDays.has(d)) {
      eDays.push(d);
      usedDays.add(d);
    }
  }

  const sessions: PlannedSession[] = [];
  for (let di = 1; di <= 7; di++) {
    const sessionDate = addDays(weekStart, di - 1);
    const ctx: WorkoutContext = {
      dayIndex: di,
      date: sessionDate,
      targetKm: di === longDayIdx ? longRunKm : easyKm,
      paces,
      level,
      phase,
      goalRace,
      weeklyKm: totalKm,
      weekIndex,
    };

    if (di === longDayIdx) {
      const recipe = selectWorkoutRecipe({
        target: "long",
        ctx,
        daysPerWeek,
        trainingFocus,
        difficultyPreference,
        preferCutback: isDeload,
        maxStressScore: qualityCount >= MAX_HARD_SESSIONS[level]
          ? 2
          : qualityCount === MAX_HARD_SESSIONS[level] - 1
            ? 3
            : undefined,
      });
      sessions.push(buildRecipeSession(recipe, ctx, "long"));
    } else if (di === restAfterLong) {
      sessions.push(restSession(di, sessionDate));
    } else if (qDays.includes(di)) {
      const recipe = selectWorkoutRecipe({
        target: "quality",
        ctx,
        daysPerWeek,
        recentRecipeIds: recentQualityRecipeIds,
        trainingFocus,
        difficultyPreference,
      });
      recentQualityRecipeIds.push(recipe.id);
      sessions.push(buildRecipeSession(recipe, ctx, "quality"));
    } else if (eDays.includes(di)) {
      const recipe = selectWorkoutRecipe({
        target: "easy",
        ctx,
        daysPerWeek,
        trainingFocus,
        difficultyPreference,
      });
      sessions.push(buildRecipeSession(recipe, ctx, "easy"));
    } else {
      sessions.push(restSession(di, sessionDate));
    }
  }

  return sessions;
}

// ---------------------------------------------------------------------------
// ACWR
// ---------------------------------------------------------------------------

function computeAcwr(weekIndex: number, volumes: number[]): number | null {
  // Source: Gabbett 2016 BJSM — keep 0.8–1.3.
  if (weekIndex < 4) return null;
  const acute = volumes[weekIndex];
  const window = volumes.slice(Math.max(0, weekIndex - 4), weekIndex);
  const chronic = window.reduce((a, b) => a + b, 0) / window.length;
  if (chronic === 0) return null;
  return Math.round((acute / chronic) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

function validatePlan(weeks: TrainingWeek[], volumes: number[]): string[] {
  const warnings: string[] = [];
  const peakVol = Math.max(...volumes);
  let deloadGap = 0;

  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i];
    const { total_km, long_run_km, acwr, is_deload, phase, week_index } = week;

    if (total_km > 0) {
      const lrPct = long_run_km / total_km;
      if (lrPct > 0.34) {
        warnings.push(
          `Week ${week_index}: long run ${long_run_km.toFixed(1)} km is ${Math.round(lrPct * 100)}% of weekly volume. Cap is 33%.`
        );
      }
    }

    if (acwr !== null && acwr > 1.3) {
      warnings.push(`Week ${week_index}: ACWR ${acwr} exceeds 1.3. Source: Gabbett 2016.`);
    }

    if (phase !== "taper") {
      deloadGap = is_deload ? 0 : deloadGap + 1;
      if (deloadGap > 5) {
        warnings.push(`Week ${week_index}: ${deloadGap} consecutive load weeks without a deload.`);
      }
    }
  }

  const taperWeeks = weeks.filter(w => w.phase === "taper");
  if (taperWeeks.length && peakVol > 0) {
    const finalVol = taperWeeks[taperWeeks.length - 1].total_km;
    const reduction = 1 - finalVol / peakVol;
    if (reduction < 0.38) {
      warnings.push(
        `Taper final week ${finalVol.toFixed(0)} km is only ${Math.round(reduction * 100)}% below peak. Target 40–60%. Source: Bosquet 2007.`
      );
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function buildPlan(inputs: PlanInputs): TrainingPlan {
  const { goal_race, goal_date, current_weekly_km, longest_recent_km, age, days_per_week } = inputs;
  const longRunDay = inputs.long_run_day ?? "saturday";
  const today = new Date();
  const goalDateObj = new Date(goal_date);

  // 1. VDOT and paces
  let vdot: number | null = null;
  let vdotSource: "race" | "riegel_estimate" | "hr_fallback" | "none" = "none";

  if (inputs.recent_race) {
    vdot = vdotFromRace(inputs.recent_race.distance_m, inputs.recent_race.time_s);
    vdotSource = "race";
  }

  // Estimated race time for the goal distance is a secondary VDOT source.
  // Only used when no actual recent race is available.
  if (vdot === null && inputs.estimated_race_time_s) {
    const GOAL_DISTANCE_M: Record<string, number> = {
      "5K": 5000, "10K": 10000, half: 21097, marathon: 42195,
    };
    const distanceM = GOAL_DISTANCE_M[goal_race];
    if (distanceM) {
      vdot = vdotFromRace(distanceM, inputs.estimated_race_time_s);
      vdotSource = "race";
    }
  }

  if (vdot === null && longest_recent_km >= 5) {
    const estimatedTime = Math.round(longest_recent_km * 390);
    vdot = vdotFromRace(Math.round(longest_recent_km * 1000), estimatedTime);
    vdotSource = "riegel_estimate";
  }

  const paces: Paces = vdot !== null
    ? pacesFromVdot(vdot)
    : { E_low: 390, E_high: 450, M: 360, T: 330, I: 300, R: 270 };

  if (vdot === null) vdotSource = "hr_fallback";

  // 2. HRmax
  const hrmax = inputs.max_hr ?? tanakaHrmax(age);
  const zones = hrZones(hrmax);

  // 3. Level — infer from training data, then apply safe-level resolution if user
  //    self-selected. Self-selected level can only go downward (conservative).
  const inferredLevel = classifyRunner(goal_race, current_weekly_km, longest_recent_km, vdot);
  const level = inputs.self_selected_level
    ? resolveSafeLevel(inputs.self_selected_level, inferredLevel)
    : inferredLevel;

  // 4. Plan length
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksTotal = Math.max(1, Math.floor((goalDateObj.getTime() - today.getTime()) / msPerWeek));
  const taperWks = TAPER_WEEKS[goal_race];
  const minWks = MIN_WEEKS[goal_race][level];

  if (weeksTotal < minWks) {
    throw new Error(
      `Only ${weeksTotal} weeks until ${goal_date}. ` +
      `A ${level} ${goal_race} plan needs at least ${minWks} weeks. ` +
      `Please choose a later goal date or a shorter race distance.`
    );
  }

  // 5. Phases + volume
  const phases = splitPhases(weeksTotal, taperWks);
  const startKm = Math.max(current_weekly_km, FLOOR_KM[goal_race][level]);
  const peakKm = PEAK_KM[goal_race][level];
  let volumes = buildVolumeCurve(startKm, peakKm, weeksTotal, level, phases);

  // 6. Plan start date
  const planStart = nextMonday(today);

  // 7. Build weeks
  const weeks: TrainingWeek[] = [];
  let loadWeekCounter = 0;

  for (let i = 0; i < weeksTotal; i++) {
    const phase = phases[i];
    const isDeload = phase !== "taper" && ++loadWeekCounter % DELOAD_EVERY_N_WEEKS === 0;

    const vol = volumes[i];
    const longRunKm = round1(Math.min(vol * 0.30, LONG_RUN_CAP_KM[goal_race]));
    const acwr = computeAcwr(i, volumes);
    const weekStart = addDays(planStart, i * 7);
    const recentQualityRecipeIds = weeks
      .slice(-3)
      .flatMap(w => w.sessions)
      .filter(s => s.session_role === "quality")
      .map(s => s.recipe_id)
      .filter((id): id is string => Boolean(id));

    const sessions = layoutWeek(
      i + 1, weekStart, vol, longRunKm, phase, level, goal_race, isDeload,
      days_per_week, longRunDay, paces,
      inputs.training_focus ?? "balanced",
      inputs.difficulty_preference ?? "balanced",
      recentQualityRecipeIds,
    );

    const qualityCount = sessions.filter(
      s => s.session_role === "quality"
    ).length;

    weeks.push({
      week_index: i + 1,
      phase,
      is_deload: isDeload,
      total_km: vol,
      long_run_km: longRunKm,
      quality_count: qualityCount,
      acwr,
      sessions,
    });
  }

  // 7b. Never raise volume AND quality in the same week. Source: Daniels.
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1];
    const curr = weeks[i];
    if (curr.is_deload || curr.phase === "taper") continue;
    if (curr.total_km > prev.total_km && curr.quality_count > prev.quality_count) {
      curr.total_km = prev.total_km;
      volumes[i] = prev.total_km;
      curr.long_run_km = round1(Math.min(curr.total_km * 0.30, LONG_RUN_CAP_KM[goal_race]));
    }
  }

  // 7c. Taper weeks should never rebound above the immediately preceding
  // week after guardrail adjustments have been applied.
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1];
    const curr = weeks[i];
    if (curr.phase === "taper" && curr.total_km > prev.total_km) {
      scaleWeekVolume(curr, prev.total_km);
      volumes[i] = curr.total_km;
    }
  }

  // 8. Validate
  const warnings = validatePlan(weeks, volumes);

  return {
    meta: {
      goal_race,
      goal_date,
      level,
      inferred_level: inferredLevel,
      weeks_total: weeksTotal,
      start_date: isoDate(planStart),
      vdot,
      vdot_source: vdotSource,
      peak_weekly_km: peakKm,
      hrmax,
      generated_at: new Date().toISOString(),
      intensity_mode: inputs.intensity_mode ?? "pace",
      training_focus: inputs.training_focus ?? "balanced",
      volume_preference: inputs.volume_preference ?? "steady",
      difficulty_preference: inputs.difficulty_preference ?? "balanced",
    },
    paces,
    hr_zones: zones,
    weeks,
    warnings,
  };
}
