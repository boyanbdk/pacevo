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
