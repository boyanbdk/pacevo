import type { TrainingPlan, PlanInputs } from "@/domain/training-plan/types";

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
  source: "manual" | "file_import";
  createdAt: string;
};

export type AdaptationRule =
  | "ACWR_CAP"
  | "RHR_ELEVATED"
  | "AEROBIC_DEFICIT"
  | "MISSED_SESSION"
  | "VDOT_UPDATE"
  | "INJURY_FLAG";

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
  reason: "initial" | "adaptation" | "user_edit";
  plan: TrainingPlan;
  createdAt: string;
  adaptationRule?: AdaptationRule;
};

export type SavedPlan = {
  id: string;
  inputs: PlanInputs;
  plan: TrainingPlan; // always the latest version's plan
  status: "draft" | "active" | "completed" | "archived";
  versions: PlanVersion[];
  completedSessions: CompletedSession[];
  adaptationEvents: AdaptationEvent[];
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const plansKey = "run-tailor:plans";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Plan CRUD
// ---------------------------------------------------------------------------

export function getPlans(): SavedPlan[] {
  return readJson<SavedPlan[]>(plansKey, []);
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
