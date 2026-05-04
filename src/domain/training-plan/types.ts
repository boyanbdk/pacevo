// TypeScript types for the training plan generator.
// Must stay in sync with schemas/inputs.schema.json and schemas/plan.schema.json.

export type GoalRace = "5K" | "10K" | "half" | "marathon";
export type Level = "beginner" | "intermediate" | "advanced";
export type Phase = "base" | "build" | "peak" | "taper";
export type Surface = "road" | "trail" | "treadmill" | "track" | "mixed";
export type VdotSource = "race" | "riegel_estimate" | "hr_fallback" | "none";
export type TrainingFocus = "balanced" | "speed" | "endurance";
export type VolumePref = "gradual" | "steady" | "progressive";
export type DifficultyPref = "comfortable" | "balanced" | "challenging";
export type IntensityMode = "pace" | "rpe" | "hr";

export type SessionType =
  | "easy"
  | "long"
  | "tempo"
  | "interval"
  | "repetition"
  | "marathon_pace"
  | "recovery"
  | "strides"
  | "fartlek"
  | "hills"
  | "cross"
  | "rest";

export interface RecentRace {
  distance_m: number;
  time_s: number;
}

export interface PlanInputs {
  goal_race: GoalRace;
  goal_date: string; // ISO date
  current_weekly_km: number;
  longest_recent_km: number;
  recent_race?: RecentRace | null;
  // User's estimated finish time for the goal race distance (seconds).
  // Used to derive VDOT when no recent_race is available.
  estimated_race_time_s?: number | null;
  age: number;
  resting_hr?: number | null;
  max_hr?: number | null;
  days_per_week: number;
  session_minutes_cap?: number | null;
  long_run_day?: string;
  surface?: Surface;
  injury_flags?: string[];
  // Training preferences
  self_selected_level?: Level | null;
  training_focus?: TrainingFocus;
  volume_preference?: VolumePref;
  difficulty_preference?: DifficultyPref;
  intensity_mode?: IntensityMode;
}

export interface Paces {
  E_low: number;
  E_high: number;
  M: number | null;
  T: number | null;
  I: number | null;
  R: number | null;
}

export interface HrZones {
  Z1: [number, number];
  Z2: [number, number];
  Z3: [number, number];
  Z4: [number, number];
  Z5: [number, number];
}

export interface PlanMeta {
  goal_race: GoalRace;
  goal_date: string;
  level: Level;
  inferred_level: Level;
  weeks_total: number;
  start_date: string;
  vdot: number | null;
  vdot_source: VdotSource;
  peak_weekly_km: number;
  hrmax: number;
  generated_at: string;
  intensity_mode: IntensityMode;
  training_focus: TrainingFocus;
  volume_preference: VolumePref;
  difficulty_preference: DifficultyPref;
}

export interface PlannedSession {
  day_index: number;
  date: string;
  type: SessionType;
  session_role?: "easy" | "long" | "quality" | "recovery" | "rest";
  recipe_id?: string | null;
  recipe_family?: WorkoutFamily | null;
  stimulus?: RecipeStimulus | null;
  target_km: number | null;
  target_duration_min: number | null;
  pace_low_s_km: number | null;
  pace_high_s_km: number | null;
  hr_zone: string | null;
  target_rpe: number | null;
  description: string;
  rationale: string;
  warmup: string | null;
  main_set: string | null;
  cooldown: string | null;
}

export interface TrainingWeek {
  week_index: number;
  phase: Phase;
  is_deload: boolean;
  total_km: number;
  long_run_km: number;
  quality_count: number;
  acwr: number | null;
  sessions: PlannedSession[];
}

export interface TrainingPlan {
  meta: PlanMeta;
  paces: Paces;
  hr_zones: HrZones;
  weeks: TrainingWeek[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Workout Recipe types (Phase 3)
// ---------------------------------------------------------------------------

export type WorkoutFamily =
  | "recovery"
  | "recovery_strides"
  | "easy"
  | "easy_strides"
  | "easy_progression"
  | "long_easy"
  | "long_fast_finish"
  | "long_steady_middle"
  | "long_tempo_blocks"
  | "long_mp_segment"
  | "cutback_long"
  | "tempo_continuous"
  | "tempo_cruise"
  | "tempo_progression"
  | "tempo_ladder"
  | "tempo_race_pace"
  | "interval_short"
  | "interval_medium"
  | "interval_long"
  | "interval_vo2"
  | "hills"
  | "fartlek";

export type RecipeStimulus =
  | "recovery"
  | "aerobic"
  | "threshold"
  | "vo2max"
  | "speed"
  | "race_specific";

export type RecipeSessionType = "recovery" | "easy" | "long" | "tempo" | "interval";

export interface WorkoutContext {
  dayIndex: number;
  date: Date;
  targetKm: number;
  paces: Paces;
  level: Level;
  phase: Phase;
  goalRace: GoalRace;
  weeklyKm: number;
  weekIndex: number;
}

export interface WorkoutRecipe {
  id: string;
  family: WorkoutFamily;
  sessionType: RecipeSessionType;
  goalRaces: GoalRace[];
  levels: Level[];
  phases: Phase[];
  minWeeklyKm: number;
  maxWeeklyKm?: number;
  minDaysPerWeek: number;
  stressScore: 1 | 2 | 3 | 4 | 5;
  stimulus: RecipeStimulus;
  tags: string[];
  cooldownWeeks: number;
  build: (ctx: WorkoutContext) => PlannedSession;
}
