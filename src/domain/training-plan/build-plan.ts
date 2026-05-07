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

const TAPER_START_VOLUME_FACTOR: Record<GoalRace, number> = {
  "5K": 0.70,
  "10K": 0.70,
  "half": 0.80,
  "marathon": 0.85,
};

const TAPER_FINAL_VOLUME_FACTOR: Record<GoalRace, number> = {
  "5K": 0.50,
  "10K": 0.55,
  "half": 0.60,
  "marathon": 0.70,
};

const TAPER_WEEKS: Record<GoalRace, number> = {
  "5K": 1, "10K": 1, "half": 2, "marathon": 3,
};

const MARATHON_TAPER_FACTORS = {
  threeWeeksOut: 0.875,
  twoWeeksOut: 0.675,
  raceWeekTraining: 0.35,
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

function raceDistanceKm(goalRace: GoalRace): number {
  return {
    "5K": 5,
    "10K": 10,
    half: 21.1,
    marathon: 42.2,
  }[goalRace];
}

function raceKmForWeek(week: TrainingWeek): number {
  return round1(week.sessions
    .filter((session) => session.type === "race")
    .reduce((sum, session) => sum + (session.target_km ?? 0), 0));
}

function trainingKmExcludingRace(week: TrainingWeek): number {
  return round1(Math.max(0, week.total_km - raceKmForWeek(week)));
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
  goalRace: GoalRace,
): number[] {
  const taperStart = phases.indexOf("taper");
  const effectiveTaperStart = taperStart === -1 ? weeksTotal : taperStart;
  const taperCount = weeksTotal - effectiveTaperStart;
  const deloadFlags = deloadFlagsForPhases(phases);
  const loadWeekIndexes = phases
    .map((phase, index) => phase === "taper" ? -1 : index)
    .filter((index) => index >= 0);
  const growthWeekIndexes = loadWeekIndexes.filter((index) => !deloadFlags[index]);
  const growthWeekCount = Math.max(1, growthWeekIndexes.length);
  const safeStartKm = Math.max(1, startKm);
  const peakRatio = Math.max(1, peakKm / safeStartKm);
  let growthPosition = 0;
  let lastLoadVolume = startKm;
  let actualPeak = startKm;
  const volumes: number[] = [];

  for (let i = 0; i < weeksTotal; i++) {
    const phase = phases[i];
    if (phase === "taper") {
      const taperIndex = i - effectiveTaperStart;
      let vol: number;
      if (goalRace === "marathon") {
        const factors = taperCount >= 3
          ? [
              MARATHON_TAPER_FACTORS.threeWeeksOut,
              MARATHON_TAPER_FACTORS.twoWeeksOut,
              MARATHON_TAPER_FACTORS.raceWeekTraining,
            ]
          : taperCount === 2
            ? [MARATHON_TAPER_FACTORS.twoWeeksOut, MARATHON_TAPER_FACTORS.raceWeekTraining]
            : [MARATHON_TAPER_FACTORS.raceWeekTraining];
        vol = round1(actualPeak * factors[Math.min(taperIndex, factors.length - 1)]);
      } else {
        const startFactor = TAPER_START_VOLUME_FACTOR[goalRace];
        const finalFactor = TAPER_FINAL_VOLUME_FACTOR[goalRace];
        const factor = taperCount === 1
          ? finalFactor
          : startFactor + (finalFactor - startFactor) * (taperIndex / (taperCount - 1));
        vol = round1(actualPeak * factor);
        if (taperCount === 1) {
          vol = round1(actualPeak * finalFactor);
        }
      }
      const previous = volumes.at(-1);
      if (goalRace !== "marathon" && previous !== undefined) {
        vol = Math.min(vol, previous);
      }
      volumes.push(vol);
    } else {
      let vol: number;
      if (i === 0) {
        vol = startKm;
      } else if (deloadFlags[i]) {
        vol = round1(lastLoadVolume * DELOAD_FACTOR);
      } else {
        const denominator = Math.max(1, growthWeekCount - 1);
        const exponent = growthPosition / denominator;
        const smoothTarget = round1(safeStartKm * Math.pow(peakRatio, exponent));
        vol = growthPosition === growthWeekCount - 1
          ? round1(peakKm)
          : smoothTarget;
        if (i > 0) {
          vol = Math.min(vol, round1(lastLoadVolume * (1 + progressionRate)));
        }
      }
      if (!deloadFlags[i]) {
        lastLoadVolume = vol;
        actualPeak = Math.max(actualPeak, vol);
        growthPosition++;
      }
      volumes.push(vol);
    }
  }

  return volumes;
}

function deloadFlagsForPhases(phases: Phase[]): boolean[] {
  let loadWeekCounter = 0;
  return phases.map((phase, index) => {
    if (phase === "taper") return false;
    loadWeekCounter++;
    if (phases[index + 1] === "taper") return false;
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

  const deloadFlags = deloadFlagsForPhases(phases);
  const growthSteps = phases
    .slice(1)
    .filter((phase, index) => phase !== "taper" && !deloadFlags[index + 1])
    .length;
  const rampReachablePeak = round1(
    currentWeeklyKm * Math.pow(1 + progressionRate, growthSteps),
  );

  return round1(Math.min(readinessAwareCap, rampReachablePeak));
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
const STRIDE_RECIPE_IDS = new Set(["easy_strides", "recovery_strides"]);
const STRUCTURED_LONG_RECIPE_IDS = new Set([
  "long_fast_finish",
  "long_steady_middle",
  "long_mp_segment",
]);

type VariableSlotRole = "quality" | "easy" | "recovery";

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

function isStrideRecipe(recipe: WorkoutRecipe): boolean {
  return STRIDE_RECIPE_IDS.has(recipe.id);
}

function isStructuredLongRecipe(recipe: WorkoutRecipe): boolean {
  return STRUCTURED_LONG_RECIPE_IDS.has(recipe.id);
}

function isStructuredLongSession(session: PlannedSession): boolean {
  return Boolean(session.session_role === "long" && session.recipe_id && STRUCTURED_LONG_RECIPE_IDS.has(session.recipe_id));
}

function strideDayCap(level: Level): number {
  if (level === "beginner") return 0;
  return level === "advanced" ? 2 : 1;
}

function nextDayIndex(di: number): number {
  return (di % 7) + 1;
}

function shouldSchedulePostLongRecovery(level: Level, daysPerWeek: number, isDeload: boolean, weekIndex: number): boolean {
  return weekIndex > 1 && level !== "beginner" && daysPerWeek >= 5 && !isDeload;
}

function raceSession(di: number, d: Date, goalRace: GoalRace): PlannedSession {
  const raceGoalLabel: Record<GoalRace, string> = {
    "5K": "5K", "10K": "10K", half: "Half Marathon", marathon: "Marathon",
  };
  const raceKm = raceDistanceKm(goalRace);
  return {
    day_index: di,
    date: isoDate(d),
    type: "race",
    session_role: undefined,
    recipe_id: null,
    recipe_family: null,
    stimulus: null,
    target_km: raceKm,
    target_duration_min: null,
    pace_low_s_km: null,
    pace_high_s_km: null,
    hr_zone: null,
    target_rpe: null,
    description: `Race day - ${raceGoalLabel[goalRace]}. Trust the taper. Warm up easy, run your goal pace, race smart.`,
    rationale: "This is what the plan has been building toward. The final week reduces training load so you arrive fresh.",
    warmup: "10-15 min very easy jog with 4x20 s strides.",
    main_set: `${raceGoalLabel[goalRace]} - race at goal effort.`,
    cooldown: "10 min easy walk/jog.",
  };
}

function fmtPace(sKm: number): string {
  const m = Math.floor(sKm / 60);
  const s = sKm % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function raceWeekTuneUpDay(raceDayIndex: number | null): number | null {
  if (raceDayIndex === null || raceDayIndex < 4) return null;
  if (raceDayIndex === 4) return 1;
  if (raceDayIndex === 5) return 2;
  return 3;
}

function raceWeekPace(goalRace: GoalRace, paces: Paces): number {
  if (goalRace === "marathon") return paces.M ?? paces.E_low;
  if (goalRace === "half") return paces.T ?? paces.M ?? paces.E_low;
  if (goalRace === "10K") return paces.T ?? paces.I ?? paces.E_low;
  return paces.I ?? paces.T ?? paces.E_low;
}

function raceWeekTuneUpSession(ctx: WorkoutContext): PlannedSession {
  const pace = raceWeekPace(ctx.goalRace, ctx.paces);
  const maxKm = ctx.level === "advanced" ? 8 : ctx.level === "intermediate" ? 6 : 4.5;
  const km = round1(Math.max(3, Math.min(maxKm, ctx.targetKm)));
  const raceLabel: Record<GoalRace, string> = {
    "5K": "5K",
    "10K": "10K",
    half: "half-marathon",
    marathon: "marathon",
  };
  const repText = (() => {
    if (ctx.level === "beginner") {
      return `3x2 min at ${raceLabel[ctx.goalRace]} effort`;
    }
    if (ctx.goalRace === "marathon") {
      return ctx.level === "advanced"
        ? "3x2 km at marathon pace"
        : "2x2 km at marathon pace";
    }
    if (ctx.goalRace === "half") {
      return ctx.level === "advanced"
        ? "3x1.5 km at half-marathon effort"
        : "2x1.5 km at half-marathon effort";
    }
    return ctx.level === "advanced"
      ? `4x1 km at ${raceLabel[ctx.goalRace]} effort`
      : `3x1 km at ${raceLabel[ctx.goalRace]} effort`;
  })();
  const sessionType = ctx.goalRace === "marathon" ? "marathon_pace" : "tempo";

  return {
    day_index: ctx.dayIndex,
    date: isoDate(ctx.date),
    type: sessionType,
    session_role: "quality",
    recipe_id: "race_week_tune_up",
    recipe_family: "tempo_race_pace",
    stimulus: "race_specific",
    target_km: km,
    target_duration_min: Math.round(km * ctx.paces.E_high / 60) + 6,
    pace_low_s_km: pace,
    pace_high_s_km: pace,
    hr_zone: ctx.goalRace === "marathon" ? "Z3" : "Z4",
    target_rpe: ctx.level === "beginner" ? 6 : 7,
    description: `Race-week tune-up. Short ${raceLabel[ctx.goalRace]}-specific reps to keep race rhythm sharp.`,
    rationale: "Race-week intensity stays brief and specific so the runner rehearses goal rhythm without adding meaningful fatigue.",
    warmup: "10 min easy jog",
    main_set: `${repText} (${fmtPace(pace)} /km), full easy recovery between reps`,
    cooldown: "5-10 min easy jog",
  };
}

function shouldAddPreRaceRestDay(
  level: Level,
  daysPerWeek: number,
  goalRace: GoalRace,
  isFinalPreRaceWeek: boolean,
): boolean {
  if (!isFinalPreRaceWeek) return false;
  if (level === "beginner") return daysPerWeek >= 4;
  if (level === "intermediate") return daysPerWeek >= 5;
  return goalRace === "marathon" && daysPerWeek >= 6;
}

function plannedRunDayCount(
  daysPerWeek: number,
  phase: Phase,
  isDeload: boolean,
  isRaceWeek: boolean,
  goalRace: GoalRace,
  level: Level,
  isFinalPreRaceWeek = false,
): number {
  let runDays = daysPerWeek;
  if (isRaceWeek) {
    const raceWeekCap = goalRace === "5K" || goalRace === "10K" ? 3 : 4;
    runDays = Math.min(runDays, raceWeekCap);
  } else {
    if ((isDeload || phase === "taper") && shouldAddPreRaceRestDay(level, runDays, goalRace, isFinalPreRaceWeek)) {
      runDays -= 1;
    }
  }
  return Math.max(isRaceWeek ? 1 : 2, Math.min(7, runDays));
}

function qualityCountForWeek(args: {
  weekIndex: number;
  phase: Phase;
  level: Level;
  totalKm: number;
  isDeload: boolean;
  effectiveRunDays: number;
  isRaceWeek: boolean;
  raceDayIndex: number | null;
}): number {
  const {
    weekIndex,
    phase,
    level,
    totalKm,
    isDeload,
    effectiveRunDays,
    isRaceWeek,
    raceDayIndex,
  } = args;
  let count = QUALITY_COUNT[phase][level];

  if (level === "beginner" && weekIndex <= 4) count = 0;
  if (level === "intermediate" && count > 1 && (totalKm < 42 || effectiveRunDays < 5)) {
    count = 1;
  }
  if (level === "advanced") {
    if (count > 2 && (totalKm < 75 || effectiveRunDays < 6)) count = 2;
    if (count > 1 && totalKm < 55) count = 1;
  }
  if (isDeload && count > 0) count = 1;
  if (phase === "taper" && count > 0) count = 1;
  if (isRaceWeek) {
    count = raceDayIndex !== null && raceDayIndex >= 4 && effectiveRunDays >= 2 ? 1 : 0;
  }

  const requiredRaceOrLong = 1;
  const shouldLeaveEasyDay = effectiveRunDays >= 3 ? 1 : 0;
  const maxQuality = Math.max(0, effectiveRunDays - requiredRaceOrLong - shouldLeaveEasyDay);
  return Math.max(0, Math.min(count, maxQuality));
}

function allocateVariableKm(
  remainingKm: number,
  slots: { day: number; role: VariableSlotRole }[],
  phase: Phase,
  isDeload: boolean,
  isRaceWeek: boolean,
): Map<number, number> {
  const result = new Map<number, number>();
  if (slots.length === 0) return result;

  const easyWeights = [0.86, 1.04, 0.94, 1.14, 0.78, 1.08];
  let easyIndex = 0;
  const weights = slots.map((slot) => {
    if (slot.role === "quality") return isRaceWeek ? 1.08 : isDeload ? 1.12 : 1.22;
    if (slot.role === "recovery") return phase === "taper" || isDeload ? 0.68 : 0.74;
    const base = easyWeights[easyIndex++ % easyWeights.length];
    return phase === "taper" || isDeload ? base * 0.95 : base;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const distances = weights.map((weight) => round1(Math.max(0, remainingKm * weight / totalWeight)));
  const diff = round1(remainingKm - distances.reduce((sum, km) => sum + km, 0));
  if (Math.abs(diff) >= 0.1) {
    const adjustIndex = distances
      .map((km, index) => ({ km, index }))
      .sort((a, b) => b.km - a.km)[0]?.index ?? distances.length - 1;
    distances[adjustIndex] = round1(Math.max(0, distances[adjustIndex] + diff));
  }

  slots.forEach((slot, index) => result.set(slot.day, distances[index]));
  return result;
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
  raceDayIndex: number | null,
  isFinalPreRaceWeek: boolean,
): PlannedSession[] {
  const longDayIdx = dayIndex(longRunDay);
  const isRaceWeek = raceDayIndex !== null;
  const effectiveRunDays = plannedRunDayCount(
    daysPerWeek,
    phase,
    isDeload,
    isRaceWeek,
    goalRace,
    level,
    isFinalPreRaceWeek,
  );
  let qualityCount = qualityCountForWeek({
    weekIndex,
    phase,
    level,
    totalKm,
    isDeload,
    effectiveRunDays,
    isRaceWeek,
    raceDayIndex,
  });

  const longCtx: WorkoutContext = {
    dayIndex: longDayIdx,
    date: addDays(weekStart, longDayIdx - 1),
    targetKm: longRunKm,
    paces,
    level,
    phase,
    goalRace,
    weeklyKm: totalKm,
    weekIndex,
  };
  const selectedLongRecipe = isRaceWeek
    ? null
    : selectWorkoutRecipe({
        target: "long",
        ctx: longCtx,
        daysPerWeek,
        trainingFocus,
        difficultyPreference,
        preferCutback: isDeload,
      });

  if (selectedLongRecipe && isStructuredLongRecipe(selectedLongRecipe)) {
    qualityCount = Math.max(0, qualityCount - 1);
  }

  const restAfterLong = (longDayIdx % 7) + 1;
  const dayBeforeLong = longDayIdx === 1 ? 7 : longDayIdx - 1;
  const recoveryDays = new Set<number>();
  const usedDays = new Set<number>();
  if (isRaceWeek) {
    usedDays.add(raceDayIndex);
    if (raceDayIndex > 1) usedDays.add(raceDayIndex - 1);
    if (raceDayIndex < 7) usedDays.add(raceDayIndex + 1);
  } else {
    usedDays.add(longDayIdx);
    if (shouldSchedulePostLongRecovery(level, daysPerWeek, isDeload, weekIndex)) {
      recoveryDays.add(restAfterLong);
      usedDays.add(restAfterLong);
    } else {
      usedDays.add(restAfterLong);
    }
  }

  const qDays: number[] = [];
  const tuneUpDay = isRaceWeek && qualityCount > 0 ? raceWeekTuneUpDay(raceDayIndex) : null;
  if (tuneUpDay !== null && !usedDays.has(tuneUpDay)) {
    qDays.push(tuneUpDay);
    usedDays.add(tuneUpDay);
  }

  for (let d = 1; d <= 7 && qDays.length < qualityCount && !isRaceWeek; d++) {
    const tooCloseToRace = raceDayIndex !== null && Math.abs(d - raceDayIndex) <= 2;
    if (
      !usedDays.has(d)
      && (isRaceWeek || d !== dayBeforeLong)
      && !tooCloseToRace
      && !qDays.some(q => Math.abs(d - q) <= 1)
    ) {
      qDays.push(d);
      usedDays.add(d);
    }
  }

  qualityCount = qDays.length;
  const fixedRaceOrLongKm = isRaceWeek ? raceDistanceKm(goalRace) : longRunKm;
  const supportRunDays = Math.max(0, effectiveRunDays - 1 - qualityCount);
  const easyDays = Math.max(0, supportRunDays - recoveryDays.size);
  const supportRoleByDay = new Map<number, "easy" | "recovery">();
  recoveryDays.forEach(day => supportRoleByDay.set(day, "recovery"));
  const postQualityRecoveryDays = new Set(
    qDays
      .map(nextDayIndex)
      .filter(day => !usedDays.has(day) && day !== longDayIdx && day !== dayBeforeLong),
  );

  const eDays: number[] = [];
  for (let d = 1; d <= 7 && eDays.length < easyDays; d++) {
    if (!usedDays.has(d) && (!isRaceWeek || d < raceDayIndex!)) {
      eDays.push(d);
      supportRoleByDay.set(d, postQualityRecoveryDays.has(d) ? "recovery" : "easy");
      usedDays.add(d);
    }
  }
  const variableSlots = [
    ...qDays.map((day) => ({ day, role: "quality" as const })),
    ...Array.from(supportRoleByDay.entries()).map(([day, role]) => ({ day, role })),
  ].sort((a, b) => a.day - b.day);
  const targetKmByDay = allocateVariableKm(
    round1(Math.max(0, totalKm - fixedRaceOrLongKm)),
    variableSlots,
    phase,
    isDeload,
    isRaceWeek,
  );

  const sessions: PlannedSession[] = [];
  let strideDaysUsed = 0;
  const maxStrideDays = strideDayCap(level);
  for (let di = 1; di <= 7; di++) {
    const sessionDate = addDays(weekStart, di - 1);
    const ctx: WorkoutContext = {
      dayIndex: di,
      date: sessionDate,
      targetKm: di === longDayIdx && !isRaceWeek
        ? longRunKm
        : targetKmByDay.get(di) ?? 0,
      paces,
      level,
      phase,
      goalRace,
      weeklyKm: totalKm,
      weekIndex,
    };

    if (isRaceWeek && di === raceDayIndex) {
      sessions.push(raceSession(di, sessionDate, goalRace));
    } else if (isRaceWeek && tuneUpDay === di) {
      sessions.push(raceWeekTuneUpSession(ctx));
    } else if (!isRaceWeek && di === longDayIdx) {
      sessions.push(buildRecipeSession(selectedLongRecipe!, ctx, "long"));
    } else if (!isRaceWeek && di === restAfterLong) {
      if (supportRoleByDay.get(di) === "recovery") {
        const recipe = selectWorkoutRecipe({
          target: "recovery",
          ctx,
          daysPerWeek,
          excludeRecipeIds: ["recovery_strides"],
          trainingFocus,
          difficultyPreference,
        });
        sessions.push(buildRecipeSession(recipe, ctx, "recovery"));
      } else {
        sessions.push(restSession(di, sessionDate));
      }
    } else if (qDays.includes(di)) {
      const recipe = selectWorkoutRecipe({
        target: "quality",
        ctx,
        daysPerWeek,
        recentRecipeIds: recentQualityRecipeIds,
        excludeRecipeIds: isDeload && level !== "beginner" ? ["fartlek_8x1min"] : [],
        trainingFocus,
        difficultyPreference,
        maxStressScore: isDeload || phase === "taper" ? 3 : undefined,
      });
      recentQualityRecipeIds.push(recipe.id);
      sessions.push(buildRecipeSession(recipe, ctx, "quality"));
    } else if (eDays.includes(di)) {
      const supportRole = supportRoleByDay.get(di) ?? "easy";
      if (supportRole === "recovery") {
        const recipe = selectWorkoutRecipe({
          target: "recovery",
          ctx,
          daysPerWeek,
          excludeRecipeIds: ["recovery_strides"],
          trainingFocus,
          difficultyPreference,
        });
        sessions.push(buildRecipeSession(recipe, ctx, "recovery"));
      } else {
        const recipe = selectWorkoutRecipe({
          target: "easy",
          ctx,
          daysPerWeek,
          excludeRecipeIds: strideDaysUsed >= maxStrideDays ? ["easy_strides"] : [],
          trainingFocus,
          difficultyPreference,
        });
        if (isStrideRecipe(recipe)) strideDaysUsed++;
        sessions.push(buildRecipeSession(recipe, ctx, "easy"));
      }
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

function raceDayIndexForWeek(weekStart: Date, goalIso: string): number | null {
  for (let di = 1; di <= 7; di++) {
    if (isoDate(addDays(weekStart, di - 1)) === goalIso) return di;
  }
  return null;
}

function buildWeeksFromVolumes(args: {
  volumes: number[];
  phases: Phase[];
  deloadFlags: boolean[];
  planStart: Date;
  goalDate: string;
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
    goalDate,
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
    let vol = volumes[i];
    const weekStart = addDays(planStart, i * 7);
    const raceDayIndex = raceDayIndexForWeek(weekStart, goalDate);
    const isFinalPreRaceWeek = raceDayIndex === null
      && raceDayIndexForWeek(addDays(weekStart, 7), goalDate) !== null;
    if (raceDayIndex !== null) {
      const raceWeekRunDays = plannedRunDayCount(daysPerWeek, phase, isDeload, true, goalRace, level);
      const preRaceMinimumKm = (raceWeekRunDays - 1) * (goalRace === "marathon" ? 3 : 2.5);
      const marathonPreRaceTrainingKm = goalRace === "marathon"
        ? round1(Math.max(...volumes.slice(0, i), vol) * MARATHON_TAPER_FACTORS.raceWeekTraining)
        : null;
      const preRaceTrainingKm = marathonPreRaceTrainingKm === null
        ? Math.max(0, vol - raceDistanceKm(goalRace), preRaceMinimumKm)
        : Math.max(preRaceMinimumKm, marathonPreRaceTrainingKm);
      vol = round1(raceDistanceKm(goalRace) + preRaceTrainingKm);
      volumes[i] = vol;
    }
    const longRunKm = raceDayIndex !== null
      ? raceDistanceKm(goalRace)
      : round1(Math.min(
          vol * 0.30,
          LONG_RUN_CAP_KM[goalRace],
          maxSessionKm ?? Number.POSITIVE_INFINITY,
        ));
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
      raceDayIndex,
      isFinalPreRaceWeek,
    );

    const acwr = computeAcwr(i, volumes);
    const qualityCount = sessions.filter(
      s => s.session_role === "quality" || isStructuredLongSession(s)
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

function validatePlan(weeks: TrainingWeek[], volumes: number[], goalRace: GoalRace): string[] {
  const warnings: string[] = [];
  const peakVol = Math.max(...weeks.map(trainingKmExcludingRace));
  let deloadGap = 0;

  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i];
    const { total_km, long_run_km, acwr, is_deload, phase, week_index } = week;
    const isRaceWeek = week.sessions.some((session) => session.type === "race");

    if (total_km > 0 && !isRaceWeek) {
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

    if (!isRaceWeek && acwr !== null && acwr > 1.3) {
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
    const finalTrainingVol = trainingKmExcludingRace(taperWeeks[taperWeeks.length - 1]);
    const reduction = 1 - finalTrainingVol / peakVol;
    const minimumReduction = goalRace === "marathon" ? 0.60 : 0.38;
    if (reduction < minimumReduction) {
      warnings.push(
        `Taper final week training load ${finalTrainingVol.toFixed(0)} km is only ${Math.round(reduction * 100)}% below peak. Target a clearer race-week reduction.`
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

  // 4. Plan length — anchor from aligned Monday so the final week always contains goal_date.
  const msPerDay = 24 * 60 * 60 * 1000;
  const msPerWeek = 7 * msPerDay;
  const planStartAligned = nextMonday(today);
  // Truncate both dates to UTC midnight before computing the week count so
  // time-of-day does not cause off-by-one errors and local timezone offsets
  // from setHours do not shift the plan start date.
  const planStartDay = Math.trunc(planStartAligned.getTime() / msPerDay) * msPerDay;
  const goalDay = Math.trunc(goalDateObj.getTime() / msPerDay) * msPerDay;
  const weeksTotal = Math.max(1, Math.floor((goalDay - planStartDay) / msPerWeek) + 1);
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
  let volumes = buildVolumeCurve(current_weekly_km, peakKm, weeksTotal, progressionRate, phases, goal_race);
  const capped = constrainVolumesForSessionCap(
    volumes,
    inputs.session_minutes_cap,
    days_per_week,
    paces,
  );
  volumes = capped.volumes;
  const deloadFlags = deloadFlagsForPhases(phases);

  // 6. Plan start date (already computed and aligned above)
  const planStart = planStartAligned;

  // 7. Build weeks
  let weeks = buildWeeksFromVolumes({
    volumes,
    phases,
    deloadFlags,
    planStart,
    goalDate: goal_date,
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
      if (prev.is_deload || curr.is_deload || curr.phase === "taper") continue;
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
      goalDate: goal_date,
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
    if (curr.phase === "taper" && prev.phase === "taper" && trainingKmExcludingRace(curr) > trainingKmExcludingRace(prev)) {
      const raceKm = raceKmForWeek(curr);
      volumes[i] = round1(raceKm + trainingKmExcludingRace(prev));
      adjustedForTaper = true;
    }
  }

  if (adjustedForTaper) {
    weeks = buildWeeksFromVolumes({
      volumes,
      phases,
      deloadFlags,
      planStart,
      goalDate: goal_date,
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
    ...validatePlan(weeks, volumes, goal_race),
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
