import { calculateWorkoutPreferences } from "../domain/training-plan";
import type { PlannedSession, TrainingWeek } from "../domain/training-plan";
import type { SavedWorkout } from "../domain/workout-schema";
import { BRAND_NAME } from "./brand";
import type { CompletedSession, SavedPlan } from "./plan-storage";

export const GOAL_LABELS: Record<string, string> = {
  "5K": "5K",
  "10K": "10K",
  half: "Half marathon",
  marathon: "Marathon",
};

export const PHASE_LABELS: Record<string, string> = {
  base: "Base",
  build: "Build",
  peak: "Peak",
  taper: "Taper",
};

export const SESSION_LABELS: Record<string, string> = {
  easy: "Easy",
  long: "Long",
  tempo: "Tempo",
  interval: "Intervals",
  repetition: "Reps",
  marathon_pace: "Marathon pace",
  recovery: "Recovery",
  strides: "Strides",
  fartlek: "Fartlek",
  hills: "Hills",
  cross: "Cross",
  rest: "Rest",
};

export const RULE_LABELS: Record<string, string> = {
  ACWR_CAP: "Load cap",
  RHR_ELEVATED: "Resting HR elevated",
  AEROBIC_DEFICIT: "Aerobic deficit",
  MISSED_SESSION: "Missed session",
  VDOT_UPDATE: "Fitness update",
  INJURY_FLAG: "Injury flag",
  PREFERENCE_REPLAN: "Preference replan",
};

const DAY_ABBRS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type SessionPointer = {
  weekIndex: number;
  week: TrainingWeek;
  session: PlannedSession;
};

export type ActivityItem = {
  id: string;
  createdAt: string;
  label: string;
  detail: string;
  href?: string;
};

export function dayLabel(dayIndex: number): string {
  return DAY_ABBRS[dayIndex - 1] ?? "Day";
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function startOfToday(): Date {
  return startOfDay(new Date());
}

export function parsePlanDate(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatDate(value: string): string {
  return parsePlanDate(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function weeksRemaining(plan: SavedPlan, today = new Date()): number {
  const goal = parsePlanDate(plan.plan.meta.goal_date);
  return Math.max(0, Math.ceil((goal.getTime() - today.getTime()) / (7 * 86400000)));
}

export function currentWeekIndex(plan: SavedPlan, today = new Date()): number {
  const start = parsePlanDate(plan.plan.meta.start_date);
  return Math.min(
    Math.max(0, Math.floor((today.getTime() - start.getTime()) / (7 * 86400000))),
    plan.plan.weeks.length - 1,
  );
}

export function plannedRunSessions(week: TrainingWeek): PlannedSession[] {
  return week.sessions.filter((session) => session.type !== "rest");
}

export function sessionKey(weekIndex: number, dayIndex: number): string {
  return `${weekIndex}-${dayIndex}`;
}

export function completedKeys(sessions: CompletedSession[], weekIndex?: number): Set<string> {
  return new Set(
    sessions
      .filter((session) => weekIndex === undefined || session.weekIndex === weekIndex)
      .map((session) => sessionKey(session.weekIndex, session.dayIndex)),
  );
}

export function completedKmForWeek(plan: SavedPlan, weekIndex: number): number {
  return plan.completedSessions
    .filter((session) => session.weekIndex === weekIndex)
    .reduce((sum, session) => sum + (session.actualKm ?? 0), 0);
}

export function allRunPointers(plan: SavedPlan): SessionPointer[] {
  return plan.plan.weeks.flatMap((week, index) =>
    plannedRunSessions(week).map((session) => ({
      weekIndex: index,
      week,
      session,
    })),
  );
}

export function nextRun(plan: SavedPlan, today = new Date()): SessionPointer | null {
  const todayStart = startOfDay(today);
  const logged = completedKeys(plan.completedSessions);
  return allRunPointers(plan).find(({ weekIndex, session }) => {
    const sessionDate = startOfDay(parsePlanDate(session.date));
    return sessionDate >= todayStart && !logged.has(sessionKey(weekIndex, session.day_index));
  }) ?? null;
}

export function nextLongRun(plan: SavedPlan, fromWeekIndex: number, today = new Date()): SessionPointer | null {
  const todayStart = startOfDay(today);
  return allRunPointers(plan).find(({ weekIndex, session }) => {
    const sessionDate = startOfDay(parsePlanDate(session.date));
    return weekIndex >= fromWeekIndex && sessionDate >= todayStart && session.type === "long";
  }) ?? null;
}

export function planStatus(
  plan: SavedPlan,
  weekIndex: number,
  today = new Date(),
): { label: string; tone: "ok" | "warn" | "info"; detail: string } {
  const week = plan.plan.weeks[weekIndex];
  const todayStart = startOfDay(today);
  const logged = completedKeys(plan.completedSessions, weekIndex);
  const missed = plannedRunSessions(week).filter((session) => {
    const sessionDate = startOfDay(parsePlanDate(session.date));
    return sessionDate < todayStart && !logged.has(sessionKey(weekIndex, session.day_index));
  });
  if (missed.length > 0) {
    return {
      label: "Needs attention",
      tone: "warn",
      detail: `${missed.length} planned session${missed.length === 1 ? "" : "s"} behind this week`,
    };
  }

  const weekStart = parsePlanDate(week.sessions[0]?.date ?? plan.plan.meta.start_date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const adaptedThisWeek = plan.adaptationEvents.some((event) => {
    const fired = new Date(event.firedAt);
    return fired >= weekStart && fired < weekEnd;
  });
  if (adaptedThisWeek) {
    return { label: "Adapted this week", tone: "info", detail: `${BRAND_NAME} adjusted the plan after recent training data` };
  }

  return { label: "On track", tone: "ok", detail: "No missed sessions requiring action" };
}

export function preferenceSignal(plan: SavedPlan): string {
  const preferences = calculateWorkoutPreferences(plan.workoutFeedback)
    .filter((preference) => preference.score > 0)
    .sort((a, b) => b.score - a.score || b.favourites - a.favourites);
  const top = preferences[0];
  if (!top) return "No preferences learned yet";
  return top.recipeFamily.replaceAll("_", " ");
}

export function latestFeedbackNeeded(plan: SavedPlan): CompletedSession | null {
  const latest = [...plan.completedSessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return null;
  const id = sessionKey(latest.weekIndex, latest.dayIndex);
  return plan.workoutFeedback.some((event) => event.sessionId === id) ? null : latest;
}

export function recentActivity(plan: SavedPlan, workouts: SavedWorkout[]): ActivityItem[] {
  const logs = plan.completedSessions.map((session) => ({
    id: `log-${session.id}`,
    createdAt: session.createdAt,
    label: session.source === "manual" ? "Logged run" : "Imported run",
    detail: `${formatDate(session.date)} · ${session.actualKm ? `${session.actualKm.toFixed(1)} km` : "distance not set"}`,
    href: `/app/plans/${plan.id}/sessions/${session.weekIndex}-${session.dayIndex}`,
  }));

  const adaptations = plan.adaptationEvents.map((event) => ({
    id: `adapt-${event.id}`,
    createdAt: event.firedAt,
    label: RULE_LABELS[event.rule] ?? event.rule,
    detail: event.explanation,
    href: `/app/plans/${plan.id}`,
  }));

  const swaps = plan.versions
    .filter((version) => version.reason === "swap")
    .map((version) => ({
      id: `swap-${version.versionIndex}`,
      createdAt: version.createdAt,
      label: "Workout swapped",
      detail: `${version.swapFromRecipeId ?? "Previous recipe"} to ${version.swapToRecipeId ?? "new recipe"}`,
      href: version.swapSessionId ? `/app/plans/${plan.id}/sessions/${version.swapSessionId}` : `/app/plans/${plan.id}`,
    }));

  const oneOffs = workouts.slice(0, 2).map((workout) => ({
    id: `workout-${workout.id}`,
    createdAt: workout.updatedAt,
    label: "One-off workout",
    detail: workout.title,
    href: `/app/workouts/${workout.id}`,
  }));

  return [...logs, ...adaptations, ...swaps, ...oneOffs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
}
