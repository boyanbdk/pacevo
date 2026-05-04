// Parameterized workout recipe library (Phase 3).
//
// Each recipe encodes training intent and produces a fully-rendered PlannedSession
// via its build() function. Recipes are selected by select-workout-recipe.ts using
// scoring + filtering; they are never chosen at random.
//
// Safety priority order (enforced in select-workout-recipe.ts, not here):
//   1. Medical/injury flags  2. ACWR  3. Hard/easy spacing
//   4. Phase  5. Goal-race specificity  6. User preference  7. Novelty

import type {
  PlannedSession,
  WorkoutContext,
  WorkoutRecipe,
  GoalRace,
  Level,
  Phase,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtPace(sKm: number): string {
  const m = Math.floor(sKm / 60);
  const s = sKm % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const ALL_RACES: GoalRace[] = ["5K", "10K", "half", "marathon"];
const ALL_LEVELS: Level[] = ["beginner", "intermediate", "advanced"];
const ALL_PHASES: Phase[] = ["base", "build", "peak", "taper"];

// ---------------------------------------------------------------------------
// Recovery recipes (2 recipes)
// ---------------------------------------------------------------------------

const recoveryEasy: WorkoutRecipe = {
  id: "recovery_easy_jog",
  family: "recovery",
  sessionType: "recovery",
  goalRaces: ALL_RACES,
  levels: ALL_LEVELS,
  phases: ALL_PHASES,
  minWeeklyKm: 0,
  minDaysPerWeek: 1,
  stressScore: 1,
  stimulus: "recovery",
  tags: ["easy", "flush", "aerobic"],
  cooldownWeeks: 0,
  build(ctx) {
    const km = Math.min(ctx.targetKm, 6);
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "recovery",
      target_km: km,
      target_duration_min: Math.round(km * ctx.paces.E_high / 60),
      pace_low_s_km: ctx.paces.E_high,
      pace_high_s_km: ctx.paces.E_high,
      hr_zone: "Z1",
      target_rpe: 3,
      description: "Recovery run. Very easy, Z1. Flush legs after hard effort.",
      rationale: "Easy recovery promotes blood flow and reduces soreness without adding meaningful stress.",
      warmup: null,
      main_set: `${km.toFixed(1)} km very easy jog at Z1 (${fmtPace(ctx.paces.E_high)} /km or slower)`,
      cooldown: null,
    };
  },
};

const recoveryStrides: WorkoutRecipe = {
  id: "recovery_strides",
  family: "recovery_strides",
  sessionType: "recovery",
  goalRaces: ALL_RACES,
  levels: ["intermediate", "advanced"],
  phases: ["base", "build", "peak", "taper"],
  minWeeklyKm: 40,
  minDaysPerWeek: 4,
  stressScore: 2,
  stimulus: "speed",
  tags: ["easy", "strides", "neuromuscular"],
  cooldownWeeks: 1,
  build(ctx) {
    const km = Math.min(ctx.targetKm, 7);
    const strideCount = ctx.level === "advanced" ? 6 : 4;
    const strideRPace = ctx.paces.R ?? ctx.paces.E_low;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "recovery",
      target_km: km,
      target_duration_min: Math.round(km * ctx.paces.E_high / 60) + 5,
      pace_low_s_km: ctx.paces.E_high,
      pace_high_s_km: ctx.paces.E_high,
      hr_zone: "Z1",
      target_rpe: 4,
      description: "Recovery jog with strides. Keeps neuromuscular activation without adding aerobic load.",
      rationale: "Short strides on a recovery day maintain leg speed without raising fatigue. Source: Daniels.",
      warmup: null,
      main_set: `${km.toFixed(1)} km very easy jog, then ${strideCount}×20 s strides at mile effort (${fmtPace(strideRPace)} /km) with 60 s walk recovery`,
      cooldown: null,
    };
  },
};

// ---------------------------------------------------------------------------
// Easy recipes (2 recipes)
// ---------------------------------------------------------------------------

const easyRun: WorkoutRecipe = {
  id: "easy_run",
  family: "easy",
  sessionType: "easy",
  goalRaces: ALL_RACES,
  levels: ALL_LEVELS,
  phases: ALL_PHASES,
  minWeeklyKm: 0,
  minDaysPerWeek: 1,
  stressScore: 1,
  stimulus: "aerobic",
  tags: ["easy", "aerobic", "base"],
  cooldownWeeks: 0,
  build(ctx) {
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "easy",
      target_km: ctx.targetKm,
      target_duration_min: Math.round(ctx.targetKm * ctx.paces.E_high / 60),
      pace_low_s_km: ctx.paces.E_low,
      pace_high_s_km: ctx.paces.E_high,
      hr_zone: "Z2",
      target_rpe: 4,
      description: "Easy aerobic run. Conversational pace, Z1–Z2.",
      rationale: "80% of training volume should be easy aerobic. Source: Seiler 2010.",
      warmup: null,
      main_set: `${ctx.targetKm.toFixed(1)} km at easy pace (${fmtPace(ctx.paces.E_low)}–${fmtPace(ctx.paces.E_high)} /km)`,
      cooldown: null,
    };
  },
};

const easyWithStrides: WorkoutRecipe = {
  id: "easy_strides",
  family: "easy_strides",
  sessionType: "easy",
  goalRaces: ALL_RACES,
  levels: ["intermediate", "advanced"],
  phases: ["base", "build", "peak", "taper"],
  minWeeklyKm: 30,
  minDaysPerWeek: 3,
  stressScore: 2,
  stimulus: "speed",
  tags: ["easy", "strides", "neuromuscular", "leg-speed"],
  cooldownWeeks: 1,
  build(ctx) {
    const strideCount = ctx.level === "advanced" ? 8 : 6;
    const rPace = ctx.paces.R ?? ctx.paces.E_low;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "easy",
      target_km: ctx.targetKm,
      target_duration_min: Math.round(ctx.targetKm * ctx.paces.E_high / 60) + 5,
      pace_low_s_km: ctx.paces.E_low,
      pace_high_s_km: ctx.paces.E_high,
      hr_zone: "Z2",
      target_rpe: 5,
      description: "Easy run with strides. Builds leg speed and running economy without adding fatigue.",
      rationale: "Strides at the end of easy runs improve neuromuscular coordination. Source: Daniels.",
      warmup: null,
      main_set: `${ctx.targetKm.toFixed(1)} km easy, then ${strideCount}×20 s strides at mile effort (${fmtPace(rPace)} /km) with 60 s walk recovery`,
      cooldown: null,
    };
  },
};

// ---------------------------------------------------------------------------
// Long run recipes (5 recipes)
// ---------------------------------------------------------------------------

const longEasy: WorkoutRecipe = {
  id: "long_easy",
  family: "long_easy",
  sessionType: "long",
  goalRaces: ALL_RACES,
  levels: ALL_LEVELS,
  phases: ALL_PHASES,
  minWeeklyKm: 0,
  minDaysPerWeek: 2,
  stressScore: 2,
  stimulus: "aerobic",
  tags: ["long", "aerobic", "base", "easy"],
  cooldownWeeks: 0,
  build(ctx) {
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "long",
      target_km: ctx.targetKm,
      target_duration_min: Math.round(ctx.targetKm * ctx.paces.E_high / 60),
      pace_low_s_km: ctx.paces.E_low,
      pace_high_s_km: ctx.paces.E_high,
      hr_zone: "Z2",
      target_rpe: 5,
      description: "Long easy run. Steady aerobic effort, Z2. Builds aerobic base and fat adaptation.",
      rationale: "Long runs are the cornerstone of endurance. Cap at 30% weekly volume. Source: Daniels.",
      warmup: null,
      main_set: `${ctx.targetKm.toFixed(1)} km at easy long-run pace (${fmtPace(ctx.paces.E_low)}–${fmtPace(ctx.paces.E_high)} /km)`,
      cooldown: null,
    };
  },
};

const longFastFinish: WorkoutRecipe = {
  id: "long_fast_finish",
  family: "long_fast_finish",
  sessionType: "long",
  goalRaces: ["10K", "half", "marathon"],
  levels: ["intermediate", "advanced"],
  phases: ["build", "peak"],
  minWeeklyKm: 50,
  minDaysPerWeek: 4,
  stressScore: 3,
  stimulus: "aerobic",
  tags: ["long", "progression", "fatigue-resistance"],
  cooldownWeeks: 2,
  build(ctx) {
    const easyKm = Math.round(ctx.targetKm * 0.75 * 10) / 10;
    const fastKm = Math.round((ctx.targetKm - easyKm) * 10) / 10;
    const mPace = ctx.paces.M ?? ctx.paces.E_low;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "long",
      target_km: ctx.targetKm,
      target_duration_min: Math.round((easyKm * ctx.paces.E_high + fastKm * mPace) / 60),
      pace_low_s_km: ctx.paces.E_low,
      pace_high_s_km: mPace,
      hr_zone: "Z3",
      target_rpe: 6,
      description: "Fast-finish long run. Easy start, finishing kilometres at marathon pace. Trains fatigue resistance.",
      rationale: "Finishing fast on tired legs builds race-specific endurance. Source: Pfitzinger.",
      warmup: null,
      main_set: `${easyKm.toFixed(1)} km easy (${fmtPace(ctx.paces.E_low)}–${fmtPace(ctx.paces.E_high)} /km), then ${fastKm.toFixed(1)} km at M pace (${fmtPace(mPace)} /km)`,
      cooldown: null,
    };
  },
};

const longSteadyMiddle: WorkoutRecipe = {
  id: "long_steady_middle",
  family: "long_steady_middle",
  sessionType: "long",
  goalRaces: ["half", "marathon"],
  levels: ["intermediate", "advanced"],
  phases: ["build", "peak"],
  minWeeklyKm: 55,
  minDaysPerWeek: 4,
  stressScore: 3,
  stimulus: "aerobic",
  tags: ["long", "steady", "aerobic-threshold"],
  cooldownWeeks: 2,
  build(ctx) {
    const bookendKm = Math.round(ctx.targetKm * 0.25 * 10) / 10;
    const middleKm = Math.round((ctx.targetKm - bookendKm * 2) * 10) / 10;
    const z3Pace = ctx.paces.M ?? Math.round((ctx.paces.E_low + (ctx.paces.T ?? ctx.paces.E_low)) / 2);
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "long",
      target_km: ctx.targetKm,
      target_duration_min: Math.round((bookendKm * 2 * ctx.paces.E_high + middleKm * z3Pace) / 60),
      pace_low_s_km: ctx.paces.E_low,
      pace_high_s_km: z3Pace,
      hr_zone: "Z3",
      target_rpe: 6,
      description: "Long run with steady middle. Bookended by easy running with an aerobic middle block.",
      rationale: "Steady middle segments build aerobic threshold without the full cost of a tempo run. Source: Pfitzinger.",
      warmup: null,
      main_set: `${bookendKm.toFixed(1)} km easy → ${middleKm.toFixed(1)} km at steady pace (${fmtPace(z3Pace)} /km, Z3) → ${bookendKm.toFixed(1)} km easy`,
      cooldown: null,
    };
  },
};

const longMpSegment: WorkoutRecipe = {
  id: "long_mp_segment",
  family: "long_mp_segment",
  sessionType: "long",
  goalRaces: ["half", "marathon"],
  levels: ["intermediate", "advanced"],
  phases: ["build", "peak"],
  minWeeklyKm: 60,
  minDaysPerWeek: 4,
  stressScore: 4,
  stimulus: "race_specific",
  tags: ["long", "marathon-pace", "race-specific"],
  cooldownWeeks: 3,
  build(ctx) {
    const mpKm = ctx.goalRace === "marathon"
      ? Math.min(Math.round(ctx.targetKm * 0.4), 16)
      : Math.min(Math.round(ctx.targetKm * 0.35), 8);
    const easyKm = Math.round(((ctx.targetKm - mpKm) / 2) * 10) / 10;
    const mPace = ctx.paces.M ?? ctx.paces.E_low;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "marathon_pace",
      target_km: ctx.targetKm,
      target_duration_min: Math.round((easyKm * 2 * ctx.paces.E_high + mpKm * mPace) / 60),
      pace_low_s_km: ctx.paces.E_low,
      pace_high_s_km: mPace,
      hr_zone: "Z3",
      target_rpe: 6,
      description: "Long run with marathon-pace segment. Middle kilometres at M pace bookended by easy running.",
      rationale: "Race-specific long runs teach the body to sustain goal pace on tired legs. Source: Pfitzinger.",
      warmup: null,
      main_set: `${easyKm.toFixed(1)} km easy → ${mpKm} km at M pace (${fmtPace(mPace)} /km) → ${easyKm.toFixed(1)} km easy`,
      cooldown: null,
    };
  },
};

const cutbackLong: WorkoutRecipe = {
  id: "cutback_long",
  family: "cutback_long",
  sessionType: "long",
  goalRaces: ALL_RACES,
  levels: ALL_LEVELS,
  phases: ALL_PHASES,
  minWeeklyKm: 0,
  minDaysPerWeek: 2,
  stressScore: 1,
  stimulus: "recovery",
  tags: ["long", "deload", "recovery", "cutback"],
  cooldownWeeks: 0,
  build(ctx) {
    const km = Math.max(6, Math.round(ctx.targetKm * 0.7 * 10) / 10);
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "long",
      target_km: km,
      target_duration_min: Math.round(km * ctx.paces.E_high / 60),
      pace_low_s_km: ctx.paces.E_low,
      pace_high_s_km: ctx.paces.E_high,
      hr_zone: "Z2",
      target_rpe: 4,
      description: "Cutback long run. Shorter, fully easy. Deload week recovery.",
      rationale: "Deload long runs maintain the habit and aerobic contact without accumulating fatigue.",
      warmup: null,
      main_set: `${km.toFixed(1)} km easy long run — deload week, no pace pressure`,
      cooldown: null,
    };
  },
};

// ---------------------------------------------------------------------------
// Tempo recipes (5 recipes)
// ---------------------------------------------------------------------------

const tempoContinuous: WorkoutRecipe = {
  id: "tempo_continuous",
  family: "tempo_continuous",
  sessionType: "tempo",
  goalRaces: ALL_RACES,
  levels: ["intermediate", "advanced"],
  phases: ["build", "peak", "taper"],
  minWeeklyKm: 40,
  minDaysPerWeek: 3,
  stressScore: 3,
  stimulus: "threshold",
  tags: ["tempo", "threshold", "continuous", "lactate"],
  cooldownWeeks: 2,
  build(ctx) {
    const tPace = ctx.paces.T ?? ctx.paces.E_low;
    const durationMin = ctx.level === "advanced" ? 30 : 20;
    const tempoKm = Math.round((durationMin * 60) / tPace * 10) / 10;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "tempo",
      target_km: tempoKm + 3,
      target_duration_min: durationMin + 15,
      pace_low_s_km: tPace,
      pace_high_s_km: tPace,
      hr_zone: "Z4",
      target_rpe: 7,
      description: `${durationMin} min continuous tempo run at threshold pace. Raises lactate threshold.`,
      rationale: "Continuous tempo runs are highly effective at raising LT. Source: Daniels.",
      warmup: "10 min easy jog",
      main_set: `${durationMin} min at T pace (${fmtPace(tPace)} /km)`,
      cooldown: "5 min easy jog",
    };
  },
};

const tempoCruise: WorkoutRecipe = {
  id: "tempo_cruise_intervals",
  family: "tempo_cruise",
  sessionType: "tempo",
  goalRaces: ALL_RACES,
  levels: ALL_LEVELS,
  phases: ["build", "peak", "taper"],
  minWeeklyKm: 20,
  minDaysPerWeek: 3,
  stressScore: 3,
  stimulus: "threshold",
  tags: ["tempo", "threshold", "cruise-intervals", "structured"],
  cooldownWeeks: 2,
  build(ctx) {
    const tPace = ctx.paces.T ?? ctx.paces.E_low;
    const reps = ctx.level === "beginner" ? 3 : ctx.level === "intermediate" ? 4 : 5;
    const repMin = 8;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "tempo",
      target_km: Math.round(reps * repMin * 60 / tPace) + 3,
      target_duration_min: reps * repMin + reps + 15,
      pace_low_s_km: tPace,
      pace_high_s_km: tPace,
      hr_zone: "Z4",
      target_rpe: 7,
      description: `${reps}×${repMin} min cruise intervals at T pace with 1 min float recovery.`,
      rationale: "Cruise intervals deliver threshold stimulus with brief recovery — easier to hit than continuous tempo. Source: Daniels.",
      warmup: "10 min easy jog",
      main_set: `${reps}×${repMin} min at T pace (${fmtPace(tPace)} /km), 1 min easy float between reps`,
      cooldown: "5 min easy jog",
    };
  },
};

const tempoProgression: WorkoutRecipe = {
  id: "tempo_progression",
  family: "tempo_progression",
  sessionType: "tempo",
  goalRaces: ["10K", "half", "marathon"],
  levels: ["intermediate", "advanced"],
  phases: ["build", "peak"],
  minWeeklyKm: 50,
  minDaysPerWeek: 4,
  stressScore: 3,
  stimulus: "threshold",
  tags: ["tempo", "threshold", "progression", "aerobic-buildup"],
  cooldownWeeks: 2,
  build(ctx) {
    const tPace = ctx.paces.T ?? ctx.paces.E_low;
    const mPace = ctx.paces.M ?? ctx.paces.E_low;
    const block1Km = 3;
    const block2Km = 3;
    const block3Km = 2;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "tempo",
      target_km: block1Km + block2Km + block3Km + 3,
      target_duration_min: Math.round((block1Km * mPace + block2Km * tPace + block3Km * (tPace - 5)) / 60) + 15,
      pace_low_s_km: mPace,
      pace_high_s_km: tPace - 5,
      hr_zone: "Z4",
      target_rpe: 7,
      description: "Progression tempo. Three blocks getting progressively faster. Teaches controlled acceleration.",
      rationale: "Progression tempos build confidence and race-specific pacing feel. Source: Hudson.",
      warmup: "10 min easy jog",
      main_set: `${block1Km} km at M pace (${fmtPace(mPace)} /km) → ${block2Km} km at T pace (${fmtPace(tPace)} /km) → ${block3Km} km at sub-T (${fmtPace(tPace - 5)} /km)`,
      cooldown: "5 min easy jog",
    };
  },
};

const tempoLadder: WorkoutRecipe = {
  id: "tempo_ladder",
  family: "tempo_ladder",
  sessionType: "tempo",
  goalRaces: ["5K", "10K", "half"],
  levels: ["intermediate", "advanced"],
  phases: ["build", "peak"],
  minWeeklyKm: 50,
  minDaysPerWeek: 4,
  stressScore: 4,
  stimulus: "threshold",
  tags: ["tempo", "threshold", "ladder", "variety"],
  cooldownWeeks: 3,
  build(ctx) {
    const tPace = ctx.paces.T ?? ctx.paces.E_low;
    const iPace = ctx.paces.I ?? ctx.paces.E_low;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "tempo",
      target_km: 10,
      target_duration_min: 50,
      pace_low_s_km: tPace,
      pace_high_s_km: iPace,
      hr_zone: "Z4",
      target_rpe: 8,
      description: "Threshold ladder. Ascending and descending reps through T–I pace range.",
      rationale: "Ladders challenge multiple physiological systems in a single session. Source: Magness.",
      warmup: "10 min easy jog",
      main_set: `1 km at T (${fmtPace(tPace)}) → 800 m at I (${fmtPace(iPace)}) → 600 m at I → 400 m at I → 600 m at T → 800 m at T — 90 s easy recovery between reps`,
      cooldown: "5–10 min easy jog",
    };
  },
};

const tempoRacePace: WorkoutRecipe = {
  id: "tempo_race_pace",
  family: "tempo_race_pace",
  sessionType: "tempo",
  goalRaces: ["5K", "10K"],
  levels: ["intermediate", "advanced"],
  phases: ["peak", "taper"],
  minWeeklyKm: 45,
  minDaysPerWeek: 3,
  stressScore: 3,
  stimulus: "race_specific",
  tags: ["tempo", "race-pace", "race-specific", "sharpening"],
  cooldownWeeks: 2,
  build(ctx) {
    const tPace = ctx.paces.T ?? ctx.paces.E_low;
    const reps = ctx.goalRace === "5K" ? 3 : 4;
    const repKm = ctx.goalRace === "5K" ? 1.5 : 2;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "tempo",
      target_km: reps * repKm + 3,
      target_duration_min: Math.round(reps * repKm * tPace / 60) + 15,
      pace_low_s_km: tPace,
      pace_high_s_km: tPace,
      hr_zone: "Z4",
      target_rpe: 8,
      description: `${reps}×${repKm} km at race-pace tempo. Peak sharpening for ${ctx.goalRace}.`,
      rationale: "Race-pace efforts in the peak phase lock in goal pace and build confidence. Source: Daniels.",
      warmup: "10 min easy jog",
      main_set: `${reps}×${repKm} km at T pace (${fmtPace(tPace)} /km) with 2 min easy recovery`,
      cooldown: "5–10 min easy jog",
    };
  },
};

// ---------------------------------------------------------------------------
// Interval recipes (7 recipes)
// ---------------------------------------------------------------------------

const intervalShort: WorkoutRecipe = {
  id: "interval_12x400",
  family: "interval_short",
  sessionType: "interval",
  goalRaces: ["5K", "10K"],
  levels: ["intermediate", "advanced"],
  phases: ["build", "peak"],
  minWeeklyKm: 40,
  minDaysPerWeek: 3,
  stressScore: 4,
  stimulus: "vo2max",
  tags: ["interval", "short", "vo2max", "speed"],
  cooldownWeeks: 2,
  build(ctx) {
    const iPace = ctx.paces.I ?? ctx.paces.E_low;
    const reps = ctx.level === "advanced" ? 12 : 10;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "interval",
      target_km: reps * 0.4 + 4,
      target_duration_min: Math.round(reps * 0.4 * iPace / 60) + reps * 1.5 + 20,
      pace_low_s_km: iPace,
      pace_high_s_km: iPace,
      hr_zone: "Z5",
      target_rpe: 9,
      description: `${reps}×400 m at I pace. Short VO₂max intervals build speed and aerobic ceiling.`,
      rationale: "Short reps at I pace are the most efficient VO₂max stimulus. Source: Daniels.",
      warmup: "10 min easy jog",
      main_set: `${reps}×400 m at I pace (${fmtPace(iPace)} /km) with 400 m easy jog recovery`,
      cooldown: "5–10 min easy jog",
    };
  },
};

const intervalMedium: WorkoutRecipe = {
  id: "interval_6x800",
  family: "interval_medium",
  sessionType: "interval",
  goalRaces: ["5K", "10K", "half"],
  levels: ["intermediate", "advanced"],
  phases: ["build", "peak"],
  minWeeklyKm: 45,
  minDaysPerWeek: 3,
  stressScore: 4,
  stimulus: "vo2max",
  tags: ["interval", "medium", "vo2max", "classic"],
  cooldownWeeks: 2,
  build(ctx) {
    const iPace = ctx.paces.I ?? ctx.paces.E_low;
    const reps = ctx.level === "advanced" ? 8 : 6;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "interval",
      target_km: reps * 0.8 + 4,
      target_duration_min: Math.round(reps * 0.8 * iPace / 60) + reps * 2 + 20,
      pace_low_s_km: iPace,
      pace_high_s_km: iPace,
      hr_zone: "Z5",
      target_rpe: 9,
      description: `${reps}×800 m at I pace. Classic VO₂max session.`,
      rationale: "800 m reps balance effort duration with repeatable quality. Source: Daniels.",
      warmup: "10 min easy jog",
      main_set: `${reps}×800 m at I pace (${fmtPace(iPace)} /km) with 400 m easy jog recovery`,
      cooldown: "5–10 min easy jog",
    };
  },
};

const intervalLong: WorkoutRecipe = {
  id: "interval_5x1000",
  family: "interval_long",
  sessionType: "interval",
  goalRaces: ["5K", "10K", "half"],
  levels: ["intermediate", "advanced"],
  phases: ["build", "peak"],
  minWeeklyKm: 50,
  minDaysPerWeek: 4,
  stressScore: 4,
  stimulus: "vo2max",
  tags: ["interval", "long", "vo2max", "endurance-speed"],
  cooldownWeeks: 2,
  build(ctx) {
    const iPace = ctx.paces.I ?? ctx.paces.E_low;
    const reps = ctx.level === "advanced" ? 6 : 5;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "interval",
      target_km: reps * 1.0 + 4,
      target_duration_min: Math.round(reps * 1.0 * iPace / 60) + reps * 2.5 + 20,
      pace_low_s_km: iPace,
      pace_high_s_km: iPace,
      hr_zone: "Z5",
      target_rpe: 9,
      description: `${reps}×1000 m at I pace. Sustained VO₂max stimulus.`,
      rationale: "1000 m reps spend more time near VO₂max than shorter reps. Source: Daniels.",
      warmup: "10 min easy jog",
      main_set: `${reps}×1000 m at I pace (${fmtPace(iPace)} /km) with 400 m easy jog recovery`,
      cooldown: "5–10 min easy jog",
    };
  },
};

const intervalVo2: WorkoutRecipe = {
  id: "interval_4x1200",
  family: "interval_vo2",
  sessionType: "interval",
  goalRaces: ["10K", "half", "marathon"],
  levels: ["advanced"],
  phases: ["build", "peak"],
  minWeeklyKm: 70,
  minDaysPerWeek: 5,
  stressScore: 5,
  stimulus: "vo2max",
  tags: ["interval", "vo2max", "long-rep", "demanding"],
  cooldownWeeks: 3,
  build(ctx) {
    const iPace = ctx.paces.I ?? ctx.paces.E_low;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "interval",
      target_km: 4 * 1.2 + 5,
      target_duration_min: Math.round(4 * 1.2 * iPace / 60) + 4 * 3 + 20,
      pace_low_s_km: iPace,
      pace_high_s_km: iPace,
      hr_zone: "Z5",
      target_rpe: 9,
      description: "4×1200 m at I pace. Extended VO₂max reps for advanced runners.",
      rationale: "Longer VO₂max reps at I pace maximize time at maximal oxygen uptake. Source: Daniels.",
      warmup: "10 min easy jog",
      main_set: `4×1200 m at I pace (${fmtPace(iPace)} /km) with 400 m easy jog recovery`,
      cooldown: "10 min easy jog",
    };
  },
};

const hills: WorkoutRecipe = {
  id: "hills_8x60s",
  family: "hills",
  sessionType: "interval",
  goalRaces: ALL_RACES,
  levels: ["intermediate", "advanced"],
  phases: ["base", "build"],
  minWeeklyKm: 35,
  minDaysPerWeek: 3,
  stressScore: 3,
  stimulus: "speed",
  tags: ["hills", "strength", "form", "power"],
  cooldownWeeks: 2,
  build(ctx) {
    const reps = ctx.level === "advanced" ? 10 : 8;
    const rPace = ctx.paces.R ?? ctx.paces.E_low;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "hills",
      target_km: 6,
      target_duration_min: 40,
      pace_low_s_km: rPace,
      pace_high_s_km: rPace,
      hr_zone: "Z4",
      target_rpe: 8,
      description: `${reps}×60 s hill repeats at hard effort. Builds running-specific strength and form.`,
      rationale: "Hill repeats build leg strength and improve running economy with lower injury risk than track speedwork. Source: Daniels.",
      warmup: "10 min easy jog to hill",
      main_set: `${reps}×60 s uphill at hard effort (${fmtPace(rPace)} /km perceived flat equivalent), easy jog back as recovery`,
      cooldown: "5–10 min easy jog",
    };
  },
};

const fartlek: WorkoutRecipe = {
  id: "fartlek_8x1min",
  family: "fartlek",
  sessionType: "interval",
  goalRaces: ALL_RACES,
  levels: ALL_LEVELS,
  phases: ["base", "build", "peak"],
  minWeeklyKm: 15,
  minDaysPerWeek: 2,
  stressScore: 2,
  stimulus: "aerobic",
  tags: ["fartlek", "unstructured", "fun", "beginner-friendly"],
  cooldownWeeks: 1,
  build(ctx) {
    const iPace = ctx.paces.I ?? ctx.paces.E_low;
    const reps = ctx.level === "beginner" ? 6 : 8;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "fartlek",
      target_km: ctx.targetKm,
      target_duration_min: Math.round(ctx.targetKm * ctx.paces.E_high / 60) + 5,
      pace_low_s_km: ctx.paces.E_low,
      pace_high_s_km: iPace,
      hr_zone: "Z3",
      target_rpe: 6,
      description: `${reps}×1 min fartlek surges within an easy run. Unstructured speed introduction.`,
      rationale: "Fartlek eases beginners into quality sessions while preserving the freedom of easy running. Source: Higdon.",
      warmup: null,
      main_set: `${ctx.targetKm.toFixed(1)} km easy with ${reps}×1 min surges at 10K effort (${fmtPace(iPace)} /km) whenever you feel ready — no fixed spacing`,
      cooldown: null,
    };
  },
};

const intervalBeginnerFriendly: WorkoutRecipe = {
  id: "interval_beginner_400",
  family: "interval_short",
  sessionType: "interval",
  goalRaces: ["5K", "10K"],
  levels: ["beginner"],
  phases: ["build", "peak"],
  minWeeklyKm: 20,
  minDaysPerWeek: 3,
  stressScore: 3,
  stimulus: "vo2max",
  tags: ["interval", "beginner", "short", "accessible"],
  cooldownWeeks: 2,
  build(ctx) {
    const iPace = ctx.paces.I ?? ctx.paces.E_low;
    return {
      day_index: ctx.dayIndex,
      date: isoDate(ctx.date),
      type: "interval",
      target_km: 6 * 0.4 + 4,
      target_duration_min: Math.round(6 * 0.4 * iPace / 60) + 6 * 2 + 20,
      pace_low_s_km: iPace,
      pace_high_s_km: iPace,
      hr_zone: "Z4",
      target_rpe: 8,
      description: "6×400 m at I pace with walk-jog recovery. Beginner VO₂max introduction.",
      rationale: "Short 400 m reps build speed tolerance with enough recovery for beginners to hit quality. Source: Higdon.",
      warmup: "10 min easy jog",
      main_set: `6×400 m at I pace (${fmtPace(iPace)} /km) with 400 m easy walk/jog recovery`,
      cooldown: "5 min easy jog",
    };
  },
};

// ---------------------------------------------------------------------------
// Recipe registry
// ---------------------------------------------------------------------------

export const WORKOUT_RECIPES: WorkoutRecipe[] = [
  // Recovery (2)
  recoveryEasy,
  recoveryStrides,
  // Easy (2)
  easyRun,
  easyWithStrides,
  // Long (5)
  longEasy,
  longFastFinish,
  longSteadyMiddle,
  longMpSegment,
  cutbackLong,
  // Tempo (5)
  tempoContinuous,
  tempoCruise,
  tempoProgression,
  tempoLadder,
  tempoRacePace,
  // Interval (7)
  intervalShort,
  intervalMedium,
  intervalLong,
  intervalVo2,
  hills,
  fartlek,
  intervalBeginnerFriendly,
];

export function getRecipeById(id: string): WorkoutRecipe | undefined {
  return WORKOUT_RECIPES.find(r => r.id === id);
}

export function getRecipesByFamily(family: string): WorkoutRecipe[] {
  return WORKOUT_RECIPES.filter(r => r.family === family);
}

export function getRecipesBySessionType(sessionType: string): WorkoutRecipe[] {
  return WORKOUT_RECIPES.filter(r => r.sessionType === sessionType);
}
