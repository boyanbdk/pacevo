import { runAdaptations } from "../domain/training-plan/adapt-plan";
import type { ActivityMatch, ImportedActivity } from "../domain/training-plan/activity-import";
import { parsePlanDate } from "./plan-dates";
import {
  applyAdaptation,
  attachExistingImportedActivityToSession,
  getPlan,
  getWorkoutPreferences,
  linkImportedActivityToSession,
  type SavedPlan,
} from "./plan-storage";

export type ActivityImportTarget = {
  weekIndex: number;
  dayIndex: number;
};

export function currentWeekIndexForPlan(plan: SavedPlan, today = new Date()): number {
  const startDate = parsePlanDate(plan.plan.meta.start_date);
  return Math.min(
    Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / (7 * 86400000))),
    plan.plan.weeks.length - 1,
  );
}

export function providerActivityIdForImport(activity: ImportedActivity): string | null {
  if (activity.source !== "strava") return null;
  return activity.providerActivityId ?? activity.id.replace(/^strava:/, "");
}

export function targetFromActivityMatch(match: ActivityMatch): ActivityImportTarget | null {
  if (match.weekIndex === null || match.dayIndex === null) return null;
  return { weekIndex: match.weekIndex, dayIndex: match.dayIndex };
}

export async function markStravaActivityImported(activity: ImportedActivity, importedIntoPlan: boolean): Promise<void> {
  const providerActivityId = providerActivityIdForImport(activity);
  if (!providerActivityId) return;

  const response = await fetch(`/api/integrations/strava/activities/${encodeURIComponent(providerActivityId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ importedIntoPlan }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? "Could not update Strava import status.");
  }
}

export function importActivityIntoPlan(
  plan: SavedPlan,
  activity: ImportedActivity,
  target: ActivityImportTarget,
): SavedPlan {
  linkImportedActivityToSession(plan.id, {
    ...activity,
    providerActivityId: providerActivityIdForImport(activity) ?? activity.providerActivityId,
  }, target);

  let refreshed = getPlan(plan.id);
  if (!refreshed) {
    throw new Error(`Plan ${plan.id} not found after importing activity.`);
  }

  const result = runAdaptations(
    refreshed.plan,
    refreshed.completedSessions,
    refreshed.inputs,
    currentWeekIndexForPlan(refreshed),
    getWorkoutPreferences(refreshed.id),
    refreshed.inputs.days_per_week,
  );

  if (result) {
    refreshed = applyAdaptation(plan.id, result.newPlan, {
      rule: result.rule,
      explanation: result.explanation,
      triggeredBySessionIds: result.triggeredBySessionIds,
      firedAt: new Date().toISOString(),
    }).plan;
  }

  return refreshed;
}

export function attachImportedActivityToPlanSession(
  plan: SavedPlan,
  activityId: string,
  target: ActivityImportTarget,
): SavedPlan {
  attachExistingImportedActivityToSession(plan.id, activityId, target);

  let refreshed = getPlan(plan.id);
  if (!refreshed) {
    throw new Error(`Plan ${plan.id} not found after attaching activity.`);
  }

  const result = runAdaptations(
    refreshed.plan,
    refreshed.completedSessions,
    refreshed.inputs,
    currentWeekIndexForPlan(refreshed),
    getWorkoutPreferences(refreshed.id),
    refreshed.inputs.days_per_week,
  );

  if (result) {
    refreshed = applyAdaptation(plan.id, result.newPlan, {
      rule: result.rule,
      explanation: result.explanation,
      triggeredBySessionIds: result.triggeredBySessionIds,
      firedAt: new Date().toISOString(),
    }).plan;
  }

  return refreshed;
}
