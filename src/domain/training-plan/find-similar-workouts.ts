import { WORKOUT_RECIPES } from "./workout-recipes";
import type {
  PlannedSession,
  TrainingPlan,
  WorkoutContext,
  WorkoutRecipe,
} from "./types";

export type SimilarWorkoutOption = {
  recipe: WorkoutRecipe;
  session: PlannedSession;
  loadDeltaPct: number;
};

function sessionLoad(session: PlannedSession): number {
  const km = session.target_km ?? 0;
  const rpe = session.target_rpe ?? 4;
  return km * rpe;
}

function sameTopLevelType(a: WorkoutRecipe, current: PlannedSession): boolean {
  if (current.session_role === "quality") return a.sessionType === "tempo" || a.sessionType === "interval";
  if (current.session_role === "long") return a.sessionType === "long";
  return a.sessionType === current.session_role;
}

function buildContext(
  plan: TrainingPlan,
  weekIndex: number,
  session: PlannedSession,
): WorkoutContext {
  const week = plan.weeks[weekIndex];
  return {
    dayIndex: session.day_index,
    date: new Date(session.date),
    targetKm: session.target_km ?? week.long_run_km,
    paces: plan.paces,
    level: plan.meta.level,
    phase: week.phase,
    goalRace: plan.meta.goal_race,
    weeklyKm: week.total_km,
    weekIndex: week.week_index,
  };
}

export function findSimilarWorkouts(
  plan: TrainingPlan,
  weekIndex: number,
  session: PlannedSession,
  daysPerWeek: number,
  limit = 3,
): SimilarWorkoutOption[] {
  if (!session.recipe_id || !session.recipe_family || !session.stimulus) return [];

  const week = plan.weeks[weekIndex];
  if (!week || session.type === "rest") return [];

  const ctx = buildContext(plan, weekIndex, session);
  const currentLoad = sessionLoad(session);

  return WORKOUT_RECIPES
    .filter((recipe) => recipe.id !== session.recipe_id)
    .filter((recipe) => sameTopLevelType(recipe, session))
    .filter((recipe) => recipe.stimulus === session.stimulus)
    .filter((recipe) => recipe.goalRaces.includes(ctx.goalRace))
    .filter((recipe) => recipe.levels.includes(ctx.level))
    .filter((recipe) => recipe.phases.includes(ctx.phase))
    .filter((recipe) => ctx.weeklyKm >= recipe.minWeeklyKm)
    .filter((recipe) => recipe.maxWeeklyKm === undefined || ctx.weeklyKm <= recipe.maxWeeklyKm)
    .filter((recipe) => daysPerWeek >= recipe.minDaysPerWeek)
    .map((recipe) => {
      const nextSession: PlannedSession = {
        ...recipe.build(ctx),
        day_index: session.day_index,
        date: session.date,
        session_role: session.session_role,
        recipe_id: recipe.id,
        recipe_family: recipe.family,
        stimulus: recipe.stimulus,
      };
      const nextLoad = sessionLoad(nextSession);
      const loadDeltaPct = currentLoad > 0
        ? Math.round(((nextLoad - currentLoad) / currentLoad) * 100)
        : 0;
      return { recipe, session: nextSession, loadDeltaPct };
    })
    .filter((option) => Math.abs(option.loadDeltaPct) <= 10)
    .sort((a, b) => {
      const tagDifference = b.recipe.tags.filter((tag) => !session.main_set?.includes(tag)).length
        - a.recipe.tags.filter((tag) => !session.main_set?.includes(tag)).length;
      return Math.abs(a.loadDeltaPct) - Math.abs(b.loadDeltaPct)
        || tagDifference
        || a.recipe.id.localeCompare(b.recipe.id);
    })
    .slice(0, limit);
}
