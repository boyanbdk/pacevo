import {
  calculateWorkoutPreferences,
  latestFeedbackForSession,
  type UserWorkoutPreference,
  type WorkoutFeedback,
  type WorkoutFeedbackReason,
  type WorkoutFeedbackType,
} from "../domain/training-plan/workout-preferences";
import type { TrainingPlan, PlanInputs, PlannedSession } from "../domain/training-plan/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CompletedSession = {
  id: string;
  planId: string;
  weekIndex: number;
  dayIndex: number;
  date: string; // ISO
  actualKm: number | null;
  actualDurationMin: number | null;
  avgHR: number | null;
  maxHR: number | null;
  rpe: number | null;
  note: string;
  source: "manual" | "file_import" | "strava";
  providerActivityId?: string;
  createdAt: string;
};

export type AdaptationRule =
  | "ACWR_CAP"
  | "RHR_ELEVATED"
  | "AEROBIC_DEFICIT"
  | "MISSED_SESSION"
  | "VDOT_UPDATE"
  | "INJURY_FLAG"
  | "PREFERENCE_REPLAN";

export type AdaptationEvent = {
  id: string;
  planId: string;
  firedAt: string; // ISO
  rule: AdaptationRule;
  explanation: string; // plain English, under 200 chars
  triggeredBySessionIds: string[];
  newVersionIndex: number;
};

export type PlanVersion = {
  versionIndex: number;
  reason: "initial" | "adaptation" | "user_edit" | "swap";
  plan: TrainingPlan;
  createdAt: string;
  adaptationRule?: AdaptationRule;
  swapSessionId?: string;
  swapFromRecipeId?: string;
  swapToRecipeId?: string;
};

export type SavedPlan = {
  id: string;
  inputs: PlanInputs;
  plan: TrainingPlan; // always the latest version's plan
  status: "draft" | "active" | "completed" | "archived";
  versions: PlanVersion[];
  completedSessions: CompletedSession[];
  adaptationEvents: AdaptationEvent[];
  workoutFeedback: WorkoutFeedback[];
  createdAt: string;
  updatedAt: string;
};

export type PlanSessionSlot = {
  weekIndex: number;
  dayIndex: number;
};

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const plansKey = "pacevo:plans";
const legacyPlansKey = "run-tailor:plans";

function normalizePlan(plan: SavedPlan): SavedPlan {
  return {
    ...plan,
    workoutFeedback: plan.workoutFeedback ?? [],
  };
}

function readJson<T>(key: string, fallback: T, legacyKey?: string): T {
  if (typeof window === "undefined") return fallback;
  const value = readJsonValue<T>(key);
  if (value.ok) return value.value;
  if (value.found || !legacyKey) return fallback;
  const legacyValue = readJsonValue<T>(legacyKey);
  return legacyValue.ok ? legacyValue.value : fallback;
}

function readJsonValue<T>(key: string): { ok: true; value: T } | { ok: false; found: boolean } {
  const value = localStorage.getItem(key);
  if (value === null) return { ok: false, found: false };
  try {
    return { ok: true, value: JSON.parse(value) as T };
  } catch {
    return { ok: false, found: true };
  }
}

// ---------------------------------------------------------------------------
// Plan CRUD
// ---------------------------------------------------------------------------

export function getPlans(): SavedPlan[] {
  return readJson<SavedPlan[]>(plansKey, [], legacyPlansKey).map(normalizePlan);
}

export function getPlan(id: string): SavedPlan | undefined {
  return getPlans().find((p) => p.id === id);
}

export function savePlan(plan: SavedPlan) {
  const plans = getPlans();
  const idx = plans.findIndex((p) => p.id === plan.id);
  const next = idx >= 0 ? plans.toSpliced(idx, 1, plan) : [plan, ...plans];
  localStorage.setItem(plansKey, JSON.stringify(next));
}

export function deletePlan(id: string) {
  localStorage.setItem(plansKey, JSON.stringify(getPlans().filter((p) => p.id !== id)));
}

export function updatePlanStatus(id: string, status: SavedPlan["status"]) {
  const plan = getPlan(id);
  if (!plan) return;
  savePlan({ ...plan, status, updatedAt: new Date().toISOString() });
}

export function createPlan(inputs: PlanInputs, plan: TrainingPlan): SavedPlan {
  const now = new Date().toISOString();
  const initialVersion: PlanVersion = {
    versionIndex: 0,
    reason: "initial",
    plan,
    createdAt: now,
  };
  return {
    id: crypto.randomUUID(),
    inputs,
    plan,
    status: "active",
    versions: [initialVersion],
    completedSessions: [],
    adaptationEvents: [],
    workoutFeedback: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Session logging
// ---------------------------------------------------------------------------

export function logSession(planId: string, session: Omit<CompletedSession, "id" | "planId" | "createdAt">): CompletedSession {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);

  const existing = plan.completedSessions.find(
    (s) => s.weekIndex === session.weekIndex && s.dayIndex === session.dayIndex,
  );

  const completed: CompletedSession = {
    ...session,
    id: existing?.id ?? crypto.randomUUID(),
    planId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  const updated: SavedPlan = {
    ...plan,
    completedSessions: [
      ...plan.completedSessions.filter(
        (s) => s.weekIndex !== session.weekIndex || s.dayIndex !== session.dayIndex,
      ),
      completed,
    ],
    updatedAt: new Date().toISOString(),
  };
  savePlan(updated);
  return completed;
}

export function getCompletedSession(planId: string, weekIndex: number, dayIndex: number): CompletedSession | undefined {
  const plan = getPlan(planId);
  return plan?.completedSessions.findLast((s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex);
}

export function removeCompletedSession(planId: string, weekIndex: number, dayIndex: number): void {
  const plan = getPlan(planId);
  if (!plan) return;
  savePlan({
    ...plan,
    completedSessions: plan.completedSessions.filter(
      (s) => !(s.weekIndex === weekIndex && s.dayIndex === dayIndex),
    ),
    updatedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Workout feedback
// ---------------------------------------------------------------------------

export function recordWorkoutFeedback(
  planId: string,
  sessionId: string,
  session: PlannedSession,
  type: WorkoutFeedbackType,
  reason?: WorkoutFeedbackReason,
): WorkoutFeedback {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);
  if (!session.recipe_id || !session.recipe_family) {
    throw new Error("Workout feedback requires recipe metadata on the planned session.");
  }

  const now = new Date().toISOString();
  const feedback: WorkoutFeedback = {
    id: crypto.randomUUID(),
    planId,
    sessionId,
    recipeId: session.recipe_id,
    recipeFamily: session.recipe_family,
    type,
    reason,
    createdAt: now,
  };

  const updated: SavedPlan = {
    ...plan,
    workoutFeedback: [...plan.workoutFeedback, feedback],
    updatedAt: now,
  };

  savePlan(updated);
  return feedback;
}

export function getWorkoutFeedbackForSession(
  planId: string,
  sessionId: string,
): WorkoutFeedback | undefined {
  const plan = getPlan(planId);
  return plan ? latestFeedbackForSession(plan.workoutFeedback, sessionId) : undefined;
}

export function getWorkoutPreferences(planId: string): UserWorkoutPreference[] {
  const plan = getPlan(planId);
  return calculateWorkoutPreferences(plan?.workoutFeedback ?? []);
}

export function applyWorkoutSwap(
  planId: string,
  weekIndex: number,
  dayIndex: number,
  sessionId: string,
  nextSession: PlannedSession,
): SavedPlan {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);

  const currentSession = plan.plan.weeks[weekIndex]?.sessions.find((s) => s.day_index === dayIndex);
  if (!currentSession) throw new Error(`Session ${sessionId} not found`);

  const now = new Date().toISOString();
  const newPlanData: TrainingPlan = {
    ...plan.plan,
    weeks: plan.plan.weeks.map((week, idx) => idx === weekIndex
      ? {
          ...week,
          sessions: week.sessions.map((session) => session.day_index === dayIndex ? nextSession : session),
        }
      : week),
  };
  const versionIndex = plan.versions.length;
  const newVersion: PlanVersion = {
    versionIndex,
    reason: "swap",
    plan: newPlanData,
    createdAt: now,
    swapSessionId: sessionId,
    swapFromRecipeId: currentSession.recipe_id ?? undefined,
    swapToRecipeId: nextSession.recipe_id ?? undefined,
  };
  const swapFeedback = currentSession.recipe_id && currentSession.recipe_family
    ? {
        id: crypto.randomUUID(),
        planId,
        sessionId,
        recipeId: currentSession.recipe_id,
        recipeFamily: currentSession.recipe_family,
        type: "swap" as const,
        createdAt: now,
      }
    : null;

  const updated: SavedPlan = {
    ...plan,
    plan: newPlanData,
    versions: [...plan.versions, newVersion],
    workoutFeedback: swapFeedback
      ? [...plan.workoutFeedback, swapFeedback]
      : plan.workoutFeedback,
    updatedAt: now,
  };

  savePlan(updated);
  return updated;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function computeWeekAcwr(weekIndex: number, totals: number[]): number | null {
  if (weekIndex < 4) return null;
  const acute = totals[weekIndex];
  const window = totals.slice(Math.max(0, weekIndex - 4), weekIndex);
  const chronic = window.reduce((sum, value) => sum + value, 0) / window.length;
  if (chronic === 0) return null;
  return Math.round((acute / chronic) * 100) / 100;
}

function refreshWeekSummaries(plan: TrainingPlan): TrainingPlan {
  const totals = plan.weeks.map((week) =>
    round1(week.sessions.reduce((sum, session) => sum + (session.target_km ?? 0), 0)),
  );
  return {
    ...plan,
    weeks: plan.weeks.map((week, index) => {
      const longRunKm = Math.max(
        0,
        ...week.sessions
          .filter((session) => session.session_role === "long" || session.type === "race")
          .map((session) => session.target_km ?? 0),
      );
      return {
        ...week,
        total_km: totals[index],
        long_run_km: round1(longRunKm),
        quality_count: week.sessions.filter((session) => session.session_role === "quality").length,
        acwr: computeWeekAcwr(index, totals),
      };
    }),
  };
}

function moveSessionToSlot(session: PlannedSession, target: PlannedSession): PlannedSession {
  return {
    ...session,
    day_index: target.day_index,
    date: target.date,
  };
}

const HARD_MOVE_TYPES = new Set<PlannedSession["type"]>([
  "tempo",
  "interval",
  "repetition",
  "marathon_pace",
  "hills",
  "fartlek",
  "race",
]);

function isHardForMoveGuard(session: PlannedSession): boolean {
  return HARD_MOVE_TYPES.has(session.type) || session.session_role === "quality";
}

function isLongForMoveGuard(session: PlannedSession): boolean {
  return session.session_role === "long" || session.type === "long" || session.type === "race";
}

function calendarDayOrdinal(weekIndex: number, dayIndex: number): number {
  return weekIndex * 7 + dayIndex;
}

function validateMovedSchedule(plan: TrainingPlan): void {
  const sessions = plan.weeks.flatMap((week, weekIndex) =>
    week.sessions
      .filter((session) => session.type !== "rest")
      .map((session) => ({ weekIndex, session })),
  );

  const hardSessions = sessions
    .filter(({ session }) => isHardForMoveGuard(session))
    .sort((a, b) =>
      calendarDayOrdinal(a.weekIndex, a.session.day_index) - calendarDayOrdinal(b.weekIndex, b.session.day_index),
    );
  for (let i = 1; i < hardSessions.length; i++) {
    const prev = hardSessions[i - 1];
    const curr = hardSessions[i];
    const gap = calendarDayOrdinal(curr.weekIndex, curr.session.day_index) - calendarDayOrdinal(prev.weekIndex, prev.session.day_index);
    if (gap <= 1) {
      throw new Error("That move would create consecutive hard days. Leave at least one easy/rest day between hard workouts.");
    }
  }

  for (const candidate of sessions) {
    if (!isHardForMoveGuard(candidate.session)) continue;
    for (const long of sessions) {
      if (!isLongForMoveGuard(long.session)) continue;
      if (long.session === candidate.session) continue;
      const gap = Math.abs(
        calendarDayOrdinal(candidate.weekIndex, candidate.session.day_index)
        - calendarDayOrdinal(long.weekIndex, long.session.day_index),
      );
      if (gap <= 1) {
        throw new Error("That move places a hard workout too close to a long run or race. Keep at least one easy/rest day between them.");
      }
    }
  }
}

function movedSessionWithOrigin(
  session: PlannedSession,
  source: PlanSessionSlot,
  targetSession: PlannedSession,
): PlannedSession {
  const moved = moveSessionToSlot(session, targetSession);
  if (session.type === "rest") {
    return {
      ...moved,
      moved_from_week_index: null,
      moved_from_day_index: null,
    };
  }
  return {
    ...moved,
    moved_from_week_index: source.weekIndex,
    moved_from_day_index: source.dayIndex,
  };
}

export function movePlannedSessionDate(
  planId: string,
  source: PlanSessionSlot,
  target: PlanSessionSlot,
): SavedPlan {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);
  if (source.weekIndex === target.weekIndex && source.dayIndex === target.dayIndex) return plan;

  const sourceSession = plan.plan.weeks[source.weekIndex]?.sessions.find((session) => session.day_index === source.dayIndex);
  const targetSession = plan.plan.weeks[target.weekIndex]?.sessions.find((session) => session.day_index === target.dayIndex);
  if (!sourceSession || !targetSession) throw new Error("Could not find both calendar slots.");
  if (sourceSession.type === "race" || targetSession.type === "race") {
    throw new Error("Race day is fixed. Move surrounding workouts instead.");
  }

  const slotHasLog = (slot: PlanSessionSlot) =>
    plan.completedSessions.some((session) => session.weekIndex === slot.weekIndex && session.dayIndex === slot.dayIndex);
  if (slotHasLog(source) || slotHasLog(target)) {
    throw new Error("Logged workout dates are locked. Remove the log before moving this workout.");
  }

  const movedSource = movedSessionWithOrigin(sourceSession, source, targetSession);
  const movedTarget = movedSessionWithOrigin(targetSession, target, sourceSession);
  const nextWeeks = plan.plan.weeks.map((week, weekIndex) => {
    if (weekIndex !== source.weekIndex && weekIndex !== target.weekIndex) return week;
    const sessions = week.sessions
      .map((session) => {
        if (weekIndex === source.weekIndex && session.day_index === source.dayIndex) return movedTarget;
        if (weekIndex === target.weekIndex && session.day_index === target.dayIndex) return movedSource;
        return session;
      })
      .sort((a, b) => a.day_index - b.day_index);
    return { ...week, sessions };
  });
  const newPlanData = refreshWeekSummaries({ ...plan.plan, weeks: nextWeeks });
  validateMovedSchedule(newPlanData);
  const now = new Date().toISOString();
  const newVersion: PlanVersion = {
    versionIndex: plan.versions.length,
    reason: "user_edit",
    plan: newPlanData,
    createdAt: now,
  };
  const updated: SavedPlan = {
    ...plan,
    plan: newPlanData,
    versions: [...plan.versions, newVersion],
    updatedAt: now,
  };

  savePlan(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Plan versioning
// ---------------------------------------------------------------------------

export function applyAdaptation(
  planId: string,
  newPlanData: TrainingPlan,
  event: Omit<AdaptationEvent, "id" | "planId" | "newVersionIndex">,
): { plan: SavedPlan; event: AdaptationEvent } {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);

  const now = new Date().toISOString();
  const versionIndex = plan.versions.length;

  const newVersion: PlanVersion = {
    versionIndex,
    reason: "adaptation",
    plan: newPlanData,
    createdAt: now,
    adaptationRule: event.rule,
  };

  const adaptationEvent: AdaptationEvent = {
    ...event,
    id: crypto.randomUUID(),
    planId,
    newVersionIndex: versionIndex,
  };

  const updated: SavedPlan = {
    ...plan,
    plan: newPlanData,
    versions: [...plan.versions, newVersion],
    adaptationEvents: [...plan.adaptationEvents, adaptationEvent],
    updatedAt: now,
  };

  savePlan(updated);
  return { plan: updated, event: adaptationEvent };
}
