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
import { formatWeekWarning } from "./warnings";

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

const VOLUME_RATE_MULTIPLIER: Record<NonNullable<PlanInputs["volume_preference"]>, number> = {
  gradual: 0.75,
  steady: 1.0,
  progressive: 1.15,
};

const VOLUME_PEAK_MULTIPLIER: Record<NonNullable<PlanInputs["volume_preference"]>, number> = {
  gradual: 0.75,
  steady: 0.9,
  progressive: 1.0,
};

const DIFFICULTY_RATE_MULTIPLIER: Record<NonNullable<PlanInputs["difficulty_preference"]>, number> = {
  comfortable: 0.85,
  balanced: 1.0,
  challenging: 1.1,
};

const DIFFICULTY_PEAK_MULTIPLIER: Record<NonNullable<PlanInputs["difficulty_preference"]>, number> = {
  comfortable: 0.85,
  balanced: 1.0,
  challenging: 1.08,
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
  if (weeksTotal <= 0) return [];
  if (weeksTotal === 1) return ["taper"];

  const effectiveTaperWeeks = Math.min(taperWeeks, Math.max(1, weeksTotal - 1));
  const remaining = weeksTotal - effectiveTaperWeeks;
  if (weeksTotal <= taperWeeks + 1) {
    return [
      ...Array(remaining).fill("peak" as Phase),
      ...Array(effectiveTaperWeeks).fill("taper" as Phase),
    ];
  }

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
    ...Array(effectiveTaperWeeks).fill("taper" as Phase),
  ];

  while (phases.length < weeksTotal) {
    phases.splice(phases.length - effectiveTaperWeeks, 0, "build");
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
  progressionRate: number,
  phases: Phase[],
): number[] {
  const taperStart = phases.indexOf("taper");
  const effectiveTaperStart = taperStart === -1 ? weeksTotal : taperStart;
  const taperCount = weeksTotal - effectiveTaperStart;
  let loadWkCount = 0;
  let lastLoadVolume = startKm;
  let actualPeak = startKm;
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
      let vol: number;
      if (i === 0) {
        vol = startKm;
      } else if (loadWkCount % DELOAD_EVERY_N_WEEKS === 0) {
        vol = round1(lastLoadVolume * DELOAD_FACTOR);
      } else {
        vol = round1(Math.min(lastLoadVolume * (1 + progressionRate), peakKm));
        lastLoadVolume = vol;
        actualPeak = Math.max(actualPeak, vol);
      }
      volumes.push(vol);
    }
  }

  return volumes;
}

function deloadFlagsForPhases(phases: Phase[]): boolean[] {
  let loadWeekCounter = 0;
  return phases.map((phase) => {
    if (phase === "taper") return false;
    loadWeekCounter++;
    return loadWeekCounter % DELOAD_EVERY_N_WEEKS === 0;
  });
}

function progressionRateForInputs(
  level: Level,
  volumePreference: NonNullable<PlanInputs["volume_preference"]>,
  difficultyPreference: NonNullable<PlanInputs["difficulty_preference"]>,
  injuryFlags: string[],
  progressiveSupported: boolean,
): number {
  const volumeMultiplier = volumePreference === "progressive" && !progressiveSupported
    ? 1.0
    : VOLUME_RATE_MULTIPLIER[volumePreference];
  const injuryMultiplier = injuryFlags.length > 0 ? 0.65 : 1.0;
  return PROGRESSION_RATE[level]
    * volumeMultiplier
    * DIFFICULTY_RATE_MULTIPLIER[difficultyPreference]
    * injuryMultiplier;
}

function sustainablePeakKm(args: {
  currentWeeklyKm: number;
  racePeakKm: number;
  levelFloorKm: number;
  weeksTotal: number;
  phases: Phase[];
  progressionRate: number;
  volumePreference: NonNullable<PlanInputs["volume_preference"]>;
  difficultyPreference: NonNullable<PlanInputs["difficulty_preference"]>;
  injuryFlags: string[];
  progressiveSupported: boolean;
}): number {
  const {
    currentWeeklyKm,
    racePeakKm,
    levelFloorKm,
    weeksTotal,
    phases,
    progressionRate,
    volumePreference,
    difficultyPreference,
    injuryFlags,
    progressiveSupported,
  } = args;

  const volumePeakMultiplier = volumePreference === "progressive" && !progressiveSupported
    ? VOLUME_PEAK_MULTIPLIER.steady
    : VOLUME_PEAK_MULTIPLIER[volumePreference];
  const injuryMultiplier = injuryFlags.length > 0 ? 0.8 : 1.0;
  const ambitionCap = Math.max(
    currentWeeklyKm,
    racePeakKm
      * volumePeakMultiplier
      * DIFFICULTY_PEAK_MULTIPLIER[difficultyPreference]
      * injuryMultiplier,
  );

  let loadWeekCounter = 0;
  let lastLoadVolume = currentWeeklyKm;
  let growablePeak = currentWeeklyKm;

  for (let i = 1; i < weeksTotal; i++) {
    if (phases[i] === "taper") break;
    loadWeekCounter++;
    if ((loadWeekCounter + 1) % DELOAD_EVERY_N_WEEKS === 0) continue;
    lastLoadVolume = round1(lastLoadVolume * (1 + progressionRate));
    growablePeak = Math.max(growablePeak, lastLoadVolume);
  }

  // If the runner is already above the race/level floor, allow normal growth.
  // If not, do not force the floor; use it only as a soft ceiling anchor.
  const readinessAwareCap = currentWeeklyKm >= levelFloorKm
    ? ambitionCap
    : Math.min(ambitionCap, Math.max(growablePeak, levelFloorKm));

  return round1(Math.min(readinessAwareCap, growablePeak));
}

function constrainVolumesForSessionCap(
  volumes: number[],
  sessionMinutesCap: number | null | undefined,
  daysPerWeek: number,
  paces: Paces,
): { volumes: number[]; capped: boolean } {
  if (!sessionMinutesCap) return { volumes, capped: false };
  const maxSessionKm = Math.max(1, (sessionMinutesCap * 60) / paces.E_high);
  const maxWeeklyKm = round1(maxSessionKm * daysPerWeek);
  let capped = false;
  const next = volumes.map((volume) => {
    if (volume <= maxWeeklyKm) return volume;
    capped = true;
    return maxWeeklyKm;
  });
  return { volumes: next, capped };
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

function buildWeeksFromVolumes(args: {
  volumes: number[];
  phases: Phase[];
  deloadFlags: boolean[];
  planStart: Date;
  goalRace: GoalRace;
  level: Level;
  daysPerWeek: number;
  longRunDay: string;
  paces: Paces;
  trainingFocus: PlanInputs["training_focus"];
  difficultyPreference: PlanInputs["difficulty_preference"];
  sessionMinutesCap?: number | null;
}): TrainingWeek[] {
  const {
    volumes,
    phases,
    deloadFlags,
    planStart,
    goalRace,
    level,
    daysPerWeek,
    longRunDay,
    paces,
    trainingFocus,
    difficultyPreference,
    sessionMinutesCap,
  } = args;

  const weeks: TrainingWeek[] = [];
  const maxSessionKm = sessionMinutesCap
    ? Math.max(1, (sessionMinutesCap * 60) / paces.E_high)
    : null;

  for (let i = 0; i < volumes.length; i++) {
    const phase = phases[i];
    const isDeload = deloadFlags[i];
    const vol = volumes[i];
    const longRunKm = round1(Math.min(
      vol * 0.30,
      LONG_RUN_CAP_KM[goalRace],
      maxSessionKm ?? Number.POSITIVE_INFINITY,
    ));
    const acwr = computeAcwr(i, volumes);
    const weekStart = addDays(planStart, i * 7);
    const recentQualityRecipeIds = weeks
      .slice(-3)
      .flatMap(w => w.sessions)
      .filter(s => s.session_role === "quality")
      .map(s => s.recipe_id)
      .filter((id): id is string => Boolean(id));

    const sessions = layoutWeek(
      i + 1, weekStart, vol, longRunKm, phase, level, goalRace, isDeload,
      daysPerWeek, longRunDay, paces,
      trainingFocus ?? "balanced",
      difficultyPreference ?? "balanced",
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

  return weeks;
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
          formatWeekWarning(
            week_index,
            `long run is ${Math.round(lrPct * 100)}% of weekly volume. Shorten it or add easy distance elsewhere so the week is less dependent on one run.`
          )
        );
      }
    }

    if (acwr !== null && acwr > 1.3) {
      warnings.push(formatWeekWarning(week_index, "training load rises faster than the recent four-week baseline. Keep this week controlled or reduce volume."));
    }

    if (phase !== "taper") {
      deloadGap = is_deload ? 0 : deloadGap + 1;
      if (deloadGap > 5) {
        warnings.push(formatWeekWarning(week_index, `${deloadGap} consecutive load weeks without a cutback. Keep this week conservative or move an easy run to rest.`));
      }
    }
  }

  const taperWeeks = weeks.filter(w => w.phase === "taper");
  if (taperWeeks.length && peakVol > 0) {
    const finalVol = taperWeeks[taperWeeks.length - 1].total_km;
    const reduction = 1 - finalVol / peakVol;
    if (reduction < 0.38) {
      warnings.push(
        `Taper final week ${finalVol.toFixed(0)} km is only ${Math.round(reduction * 100)}% below peak. Target a clearer 40–60% reduction.`
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

  // Estimated performance for a known distance is a secondary VDOT source.
  // Uses the provided estimate distance (which may differ from the goal race).
  // vdotFromRace handles Riegel conversion for any supported or nearby distance.
  if (vdot === null && inputs.estimated_race_time_s && inputs.estimated_race_distance_m) {
    vdot = vdotFromRace(inputs.estimated_race_distance_m, inputs.estimated_race_time_s);
    vdotSource = "race";
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
  const weeksTotal = Math.max(1, Math.ceil((goalDateObj.getTime() - today.getTime()) / msPerWeek));
  const taperWks = TAPER_WEEKS[goal_race];
  const minWks = MIN_WEEKS[goal_race][level];
  const shortRunwayWarning = weeksTotal < minWks
    ? `Short runway - focus on safe sharpening. Only ${weeksTotal} week${weeksTotal === 1 ? "" : "s"} until ${goal_date}; a typical ${level} ${goal_race} plan uses at least ${minWks} weeks, so this plan prioritizes safe race prep over fitness building.`
    : null;

  // 5. Phases + volume
  const phases = splitPhases(weeksTotal, taperWks);
  const volumePreference = inputs.volume_preference ?? "steady";
  const difficultyPreference = inputs.difficulty_preference ?? "balanced";
  const trainingFocus = inputs.training_focus ?? "balanced";
  const injuryFlags = inputs.injury_flags ?? [];
  const levelFloorKm = FLOOR_KM[goal_race][level];
  const racePeakKm = PEAK_KM[goal_race][level];
  const progressiveSupported = current_weekly_km >= levelFloorKm * 0.9;
  const progressionRate = progressionRateForInputs(
    level,
    volumePreference,
    difficultyPreference,
    injuryFlags,
    progressiveSupported,
  );
  const peakKm = sustainablePeakKm({
    currentWeeklyKm: current_weekly_km,
    racePeakKm,
    levelFloorKm,
    weeksTotal,
    phases,
    progressionRate,
    volumePreference,
    difficultyPreference,
    injuryFlags,
    progressiveSupported,
  });
  let volumes = buildVolumeCurve(current_weekly_km, peakKm, weeksTotal, progressionRate, phases);
  const capped = constrainVolumesForSessionCap(
    volumes,
    inputs.session_minutes_cap,
    days_per_week,
    paces,
  );
  volumes = capped.volumes;
  const deloadFlags = deloadFlagsForPhases(phases);

  // 6. Plan start date
  const planStart = nextMonday(today);

  // 7. Build weeks
  let weeks = buildWeeksFromVolumes({
    volumes,
    phases,
    deloadFlags,
    planStart,
    goalRace: goal_race,
    level,
    daysPerWeek: days_per_week,
    longRunDay,
    paces,
    trainingFocus,
    difficultyPreference,
    sessionMinutesCap: inputs.session_minutes_cap,
  });

  // 7b. Never raise volume AND quality in the same week. Source: Daniels.
  for (let pass = 0; pass < 4; pass++) {
    let adjustedForQualityLoad = false;
    for (let i = 1; i < weeks.length; i++) {
      const prev = weeks[i - 1];
      const curr = weeks[i];
      if (curr.is_deload || curr.phase === "taper") continue;
      if (curr.total_km > prev.total_km && curr.quality_count > prev.quality_count) {
        volumes[i] = prev.total_km;
        adjustedForQualityLoad = true;
      }
    }

    if (!adjustedForQualityLoad) break;
    weeks = buildWeeksFromVolumes({
      volumes,
      phases,
      deloadFlags,
      planStart,
      goalRace: goal_race,
      level,
      daysPerWeek: days_per_week,
      longRunDay,
      paces,
      trainingFocus,
      difficultyPreference,
      sessionMinutesCap: inputs.session_minutes_cap,
    });
  }

  // 7c. Taper weeks should never rebound above the immediately preceding
  // week after guardrail adjustments have been applied.
  let adjustedForTaper = false;
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1];
    const curr = weeks[i];
    if (curr.phase === "taper" && curr.total_km > prev.total_km) {
      volumes[i] = prev.total_km;
      adjustedForTaper = true;
    }
  }

  if (adjustedForTaper) {
    weeks = buildWeeksFromVolumes({
      volumes,
      phases,
      deloadFlags,
      planStart,
      goalRace: goal_race,
      level,
      daysPerWeek: days_per_week,
      longRunDay,
      paces,
      trainingFocus,
      difficultyPreference,
      sessionMinutesCap: inputs.session_minutes_cap,
    });
  }

  // 8. Validate
  const warnings = [
    ...(shortRunwayWarning ? [shortRunwayWarning] : []),
    ...(current_weekly_km < levelFloorKm
      ? [`Your recent ${current_weekly_km.toFixed(0)} km/week is below the usual ${level} ${goal_race} starting range. This plan starts from your real baseline and builds conservatively.`]
      : []),
    ...(volumePreference === "progressive" && !progressiveSupported
      ? ["Progressive volume was requested, but current training is below the usual starting range, so the build rate was kept steady."]
      : []),
    ...(capped.capped
      ? [`Some weekly volume was capped because the session limit is ${inputs.session_minutes_cap} minutes.`]
      : []),
    ...validatePlan(weeks, volumes),
  ];
  const nonTaperVolumes = volumes.filter((_, i) => phases[i] !== "taper");
  const actualPeakWeeklyKm = Math.max(...(nonTaperVolumes.length > 0 ? nonTaperVolumes : volumes));

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
      peak_weekly_km: round1(actualPeakWeeklyKm),
      hrmax,
      generated_at: new Date().toISOString(),
      intensity_mode: inputs.intensity_mode ?? "pace",
      training_focus: trainingFocus,
      volume_preference: volumePreference,
      difficulty_preference: difficultyPreference,
    },
    paces,
    hr_zones: zones,
    weeks,
    warnings,
  };
}
