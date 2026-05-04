// Deterministic workout recipe selector.
//
// This is the Phase 4 bridge: preferences and swap history are still future
// work, but plan generation now selects from the recipe registry instead of
// hardcoding one quality workout per phase.

import { WORKOUT_RECIPES } from "./workout-recipes";
import type {
  DifficultyPref,
  RecipeSessionType,
  TrainingFocus,
  WorkoutContext,
  WorkoutRecipe,
} from "./types";
import { preferenceBiasForRecipe, type UserWorkoutPreference } from "./workout-preferences";

export type RecipeSelectionTarget = RecipeSessionType | "quality";

export interface RecipeSelectionOptions {
  target: RecipeSelectionTarget;
  ctx: WorkoutContext;
  daysPerWeek: number;
  recentRecipeIds?: string[];
  trainingFocus?: TrainingFocus;
  difficultyPreference?: DifficultyPref;
  preferences?: UserWorkoutPreference[];
  preferCutback?: boolean;
}

const QUALITY_SESSION_TYPES = new Set<RecipeSessionType>(["tempo", "interval"]);
const QUALITY_STIMULI = new Set<WorkoutRecipe["stimulus"]>([
  "threshold", "vo2max", "speed", "race_specific",
]);

function hash01(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function matchesTarget(recipe: WorkoutRecipe, target: RecipeSelectionTarget): boolean {
  if (target === "quality") {
    return recipe.sessionType !== "long"
      && (QUALITY_SESSION_TYPES.has(recipe.sessionType) || QUALITY_STIMULI.has(recipe.stimulus));
  }
  return recipe.sessionType === target;
}

function isEligible(recipe: WorkoutRecipe, options: RecipeSelectionOptions): boolean {
  const { ctx, daysPerWeek, recentRecipeIds = [] } = options;

  if (!matchesTarget(recipe, options.target)) return false;
  if (!recipe.goalRaces.includes(ctx.goalRace)) return false;
  if (!recipe.levels.includes(ctx.level)) return false;
  if (!recipe.phases.includes(ctx.phase)) return false;
  if (ctx.weeklyKm < recipe.minWeeklyKm) return false;
  if (recipe.maxWeeklyKm !== undefined && ctx.weeklyKm > recipe.maxWeeklyKm) return false;
  if (daysPerWeek < recipe.minDaysPerWeek) return false;

  // Beginners get no VO2 interval work in the first 4 weeks. Fartlek and
  // threshold work can still appear later if the base weekly load supports it.
  if (ctx.level === "beginner" && ctx.weekIndex <= 4 && recipe.stimulus === "vo2max") {
    return false;
  }

  if (
    recipe.cooldownWeeks > 0
    && options.target === "quality"
    && recentRecipeIds.includes(recipe.id)
  ) {
    return false;
  }

  return true;
}

function scoreRecipe(recipe: WorkoutRecipe, options: RecipeSelectionOptions): number {
  const { ctx, trainingFocus = "balanced", difficultyPreference = "balanced" } = options;
  let score = 0;

  score += recipe.phases.includes(ctx.phase) ? 4 : 0;
  score += recipe.goalRaces.includes(ctx.goalRace) ? 3 : 0;
  score += recipe.levels.includes(ctx.level) ? 3 : 0;

  if (options.preferCutback) {
    score += recipe.id === "cutback_long" ? 8 : -2;
  } else if (recipe.id === "cutback_long") {
    score -= 4;
  }

  if (trainingFocus === "speed") {
    if (recipe.stimulus === "speed" || recipe.stimulus === "vo2max") score += 2;
    if (recipe.family === "hills" || recipe.family === "fartlek") score += 1;
  } else if (trainingFocus === "endurance") {
    if (recipe.stimulus === "aerobic" || recipe.stimulus === "race_specific") score += 2;
    if (recipe.sessionType === "long" || recipe.family.includes("long")) score += 1;
  } else {
    if (recipe.stimulus === "threshold" || recipe.stimulus === "aerobic") score += 1;
  }

  if (difficultyPreference === "comfortable") {
    score -= recipe.stressScore;
  } else if (difficultyPreference === "challenging") {
    score += recipe.stressScore;
  } else {
    score -= Math.max(0, recipe.stressScore - 3) * 0.5;
  }

  if (ctx.phase === "base" && (recipe.family === "hills" || recipe.family === "fartlek")) {
    score += 2;
  }
  if (ctx.phase === "taper" && recipe.stressScore <= 3) {
    score += 2;
  }
  if (ctx.goalRace === "marathon" && recipe.stimulus === "race_specific") {
    score += 1.5;
  }
  if (options.preferences?.length) {
    score += preferenceBiasForRecipe(recipe.id, recipe.family, options.preferences);
  }

  const tieBreaker = hash01(`${recipe.id}:${ctx.goalRace}:${ctx.weekIndex}:${ctx.dayIndex}`);
  return score + tieBreaker;
}

export function selectWorkoutRecipe(options: RecipeSelectionOptions): WorkoutRecipe {
  const candidates = WORKOUT_RECIPES.filter((recipe) => isEligible(recipe, options));

  if (candidates.length === 0) {
    const relaxedCandidates = WORKOUT_RECIPES.filter((recipe) => {
      const cutbackAllowed = recipe.id !== "cutback_long" || options.preferCutback;
      return matchesTarget(recipe, options.target)
        && cutbackAllowed
        && recipe.goalRaces.includes(options.ctx.goalRace)
        && recipe.levels.includes(options.ctx.level)
        && options.daysPerWeek >= recipe.minDaysPerWeek
        && options.ctx.weeklyKm >= recipe.minWeeklyKm
        && (recipe.maxWeeklyKm === undefined || options.ctx.weeklyKm <= recipe.maxWeeklyKm);
    });
    const volumeRelaxedCandidates = relaxedCandidates.length > 0
      ? relaxedCandidates
      : WORKOUT_RECIPES.filter((recipe) => {
          const cutbackAllowed = recipe.id !== "cutback_long" || options.preferCutback;
          return matchesTarget(recipe, options.target)
            && cutbackAllowed
            && recipe.goalRaces.includes(options.ctx.goalRace)
            && recipe.levels.includes(options.ctx.level)
            && recipe.stressScore <= 2
            && options.daysPerWeek >= recipe.minDaysPerWeek;
        });
    const nonRecent = volumeRelaxedCandidates.filter(
      recipe => !(options.recentRecipeIds ?? []).includes(recipe.id),
    );
    const fallbackPool = nonRecent.length > 0 ? nonRecent : volumeRelaxedCandidates;
    const fallback = [...fallbackPool].sort(
      (a, b) => scoreRecipe(b, options) - scoreRecipe(a, options)
        || a.id.localeCompare(b.id),
    )[0];

    if (fallback) return fallback;
    throw new Error(`No safe workout recipe found for ${options.target} session.`);
  }

  return [...candidates].sort(
    (a, b) => scoreRecipe(b, options) - scoreRecipe(a, options)
      || a.id.localeCompare(b.id),
  )[0];
}
