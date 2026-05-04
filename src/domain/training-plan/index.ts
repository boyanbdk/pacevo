export { buildPlan } from "./build-plan";
export { classifyRunner, resolveSafeLevel } from "./classify-runner";
export { vdotFromRace, pacesFromVdot, riegelPredict, tanakaHrmax, hrZones, formatPace } from "./vdot";
export { renderIntensity, RECOMMENDED_MODE, RPE_RANGES, HR_ZONE_LABELS, HR_LAG_WARNING, fmtPaceRange, hrBpmRange, fmtRpe } from "./training-intensity";
export { selectWorkoutRecipe } from "./select-workout-recipe";
export type { IntensityDisplay, SecondaryItem } from "./training-intensity";
export type { PlanInputs, TrainingPlan, TrainingWeek, PlannedSession, Paces, HrZones, PlanMeta, GoalRace, Level, Phase, SessionType, IntensityMode } from "./types";
