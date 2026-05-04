"use client";

import {
  Activity,
  AlertCircle,
  CalendarCheck,
  CalendarRange,
  ChevronRight,
  Clock,
  GitBranch,
  Heart,
  MapPin,
  Plus,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { calculateWorkoutPreferences } from "@/domain/training-plan";
import type { PlannedSession, TrainingWeek } from "@/domain/training-plan";
import type { SavedWorkout } from "@/domain/workout-schema";
import type { CompletedSession, SavedPlan } from "@/lib/plan-storage";
import { getPlans } from "@/lib/plan-storage";
import { getWorkouts } from "@/lib/storage";

const GOAL_LABELS: Record<string, string> = {
  "5K": "5K",
  "10K": "10K",
  half: "Half marathon",
  marathon: "Marathon",
};

const PHASE_LABELS: Record<string, string> = {
  base: "Base",
  build: "Build",
  peak: "Peak",
  taper: "Taper",
};

const SESSION_LABELS: Record<string, string> = {
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

const RULE_LABELS: Record<string, string> = {
  ACWR_CAP: "Load cap",
  RHR_ELEVATED: "Resting HR elevated",
  AEROBIC_DEFICIT: "Aerobic deficit",
  MISSED_SESSION: "Missed session",
  VDOT_UPDATE: "Fitness update",
  INJURY_FLAG: "Injury flag",
  PREFERENCE_REPLAN: "Preference replan",
};

const DAY_ABBRS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type SessionPointer = {
  weekIndex: number;
  week: TrainingWeek;
  session: PlannedSession;
};

type ActivityItem = {
  id: string;
  createdAt: string;
  label: string;
  detail: string;
  href?: string;
};

function dayLabel(dayIndex: number): string {
  return DAY_ABBRS[dayIndex - 1] ?? "Day";
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function formatDate(value: string): string {
  return parseDate(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function parseDate(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function weeksRemaining(plan: SavedPlan): number {
  const goal = new Date(plan.plan.meta.goal_date);
  const today = new Date();
  return Math.max(0, Math.ceil((goal.getTime() - today.getTime()) / (7 * 86400000)));
}

function currentWeekIndex(plan: SavedPlan): number {
  const today = new Date();
  const start = new Date(plan.plan.meta.start_date);
  return Math.min(
    Math.max(0, Math.floor((today.getTime() - start.getTime()) / (7 * 86400000))),
    plan.plan.weeks.length - 1,
  );
}

function plannedRunSessions(week: TrainingWeek): PlannedSession[] {
  return week.sessions.filter((session) => session.type !== "rest");
}

function sessionKey(weekIndex: number, dayIndex: number): string {
  return `${weekIndex}-${dayIndex}`;
}

function completedKeys(sessions: CompletedSession[], weekIndex?: number): Set<string> {
  return new Set(
    sessions
      .filter((session) => weekIndex === undefined || session.weekIndex === weekIndex)
      .map((session) => sessionKey(session.weekIndex, session.dayIndex)),
  );
}

function completedKmForWeek(plan: SavedPlan, weekIndex: number): number {
  return plan.completedSessions
    .filter((session) => session.weekIndex === weekIndex)
    .reduce((sum, session) => sum + (session.actualKm ?? 0), 0);
}

function allRunPointers(plan: SavedPlan): SessionPointer[] {
  return plan.plan.weeks.flatMap((week, index) =>
    plannedRunSessions(week).map((session) => ({
      weekIndex: index,
      week,
      session,
    })),
  );
}

function nextRun(plan: SavedPlan): SessionPointer | null {
  const today = startOfToday();
  const logged = completedKeys(plan.completedSessions);
  return allRunPointers(plan).find(({ weekIndex, session }) => {
    const sessionDate = parseDate(session.date);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate >= today && !logged.has(sessionKey(weekIndex, session.day_index));
  }) ?? null;
}

function nextLongRun(plan: SavedPlan, fromWeekIndex: number): SessionPointer | null {
  const today = startOfToday();
  return allRunPointers(plan).find(({ weekIndex, session }) => {
    const sessionDate = parseDate(session.date);
    sessionDate.setHours(0, 0, 0, 0);
    return weekIndex >= fromWeekIndex && sessionDate >= today && session.type === "long";
  }) ?? null;
}

function planStatus(plan: SavedPlan, weekIndex: number): { label: string; tone: "ok" | "warn" | "info"; detail: string } {
  const week = plan.plan.weeks[weekIndex];
  const today = startOfToday();
  const logged = completedKeys(plan.completedSessions, weekIndex);
  const missed = plannedRunSessions(week).filter((session) => {
    const sessionDate = parseDate(session.date);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate < today && !logged.has(sessionKey(weekIndex, session.day_index));
  });
  if (missed.length > 0) {
    return {
      label: "Needs attention",
      tone: "warn",
      detail: `${missed.length} planned session${missed.length === 1 ? "" : "s"} behind this week`,
    };
  }

  const weekStart = parseDate(week.sessions[0]?.date ?? plan.plan.meta.start_date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const adaptedThisWeek = plan.adaptationEvents.some((event) => {
    const fired = new Date(event.firedAt);
    return fired >= weekStart && fired < weekEnd;
  });
  if (adaptedThisWeek) {
    return { label: "Adapted this week", tone: "info", detail: "Plan changed after recent training data" };
  }

  return { label: "On track", tone: "ok", detail: "No missed sessions requiring action" };
}

function preferenceSignal(plan: SavedPlan): string {
  const preferences = calculateWorkoutPreferences(plan.workoutFeedback)
    .filter((preference) => preference.score > 0)
    .sort((a, b) => b.score - a.score || b.favourites - a.favourites);
  const top = preferences[0];
  if (!top) return "No preferences learned yet";
  return top.recipeFamily.replaceAll("_", " ");
}

function latestFeedbackNeeded(plan: SavedPlan): CompletedSession | null {
  const latest = [...plan.completedSessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return null;
  const id = sessionKey(latest.weekIndex, latest.dayIndex);
  return plan.workoutFeedback.some((event) => event.sessionId === id) ? null : latest;
}

function recentActivity(plan: SavedPlan, workouts: SavedWorkout[]): ActivityItem[] {
  const logs = plan.completedSessions.map((session) => ({
    id: `log-${session.id}`,
    createdAt: session.createdAt,
    label: session.source === "file_import" ? "Imported run" : "Logged run",
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

function EmptyDashboard({ workoutsCount }: { workoutsCount: number }) {
  return (
    <div className="dashboard-empty">
      <section className="panel dashboard-empty-primary">
        <div>
          <span className="dashboard-icon">
            <CalendarRange size={22} />
          </span>
          <h2>No active training plan</h2>
          <p className="muted">
            Build a race plan first, then this screen will show today&apos;s workout and weekly progress.
          </p>
        </div>
        <div className="button-row">
          <Link className="button primary" href="/app/plans/new">
            <CalendarRange size={18} />
            Build a plan
          </Link>
          <Link className="button ghost" href="/app/new">
            <Plus size={18} />
            Create one-off workout
          </Link>
        </div>
      </section>

      <section className="panel dashboard-setup">
        <h2>Setup checklist</h2>
        <div className="dashboard-checklist">
          <span>Choose goal race</span>
          <span>Add race estimate</span>
          <span>Add max heart rate</span>
          <span>Pick training days</span>
        </div>
        <p className="muted">{workoutsCount} saved one-off workout{workoutsCount === 1 ? "" : "s"}</p>
      </section>
    </div>
  );
}

function ActivePlanDashboard({ plan, workouts }: { plan: SavedPlan; workouts: SavedWorkout[] }) {
  const weekIndex = currentWeekIndex(plan);
  const week = plan.plan.weeks[weekIndex];
  const status = planStatus(plan, weekIndex);
  const next = nextRun(plan);
  const todayKey = dateKey(startOfToday());
  const nextIsToday = next ? next.session.date === todayKey : false;
  const loggedThisWeek = completedKeys(plan.completedSessions, weekIndex).size;
  const plannedThisWeek = plannedRunSessions(week).length;
  const completedKm = completedKmForWeek(plan, weekIndex);
  const latestAdaptation = [...plan.adaptationEvents].sort((a, b) => b.firedAt.localeCompare(a.firedAt))[0];
  const longRun = nextLongRun(plan, weekIndex);
  const feedbackTarget = latestFeedbackNeeded(plan);
  const activity = recentActivity(plan, workouts);

  return (
    <div className="dashboard-stack">
      <section className="dashboard-plan-band">
        <div>
          <span className={`dashboard-status ${status.tone}`}>{status.label}</span>
          <h2>{GOAL_LABELS[plan.plan.meta.goal_race]} plan</h2>
          <p>
            {formatDate(plan.plan.meta.goal_date)} · Week {weekIndex + 1} of {plan.plan.meta.weeks_total} ·{" "}
            {weeksRemaining(plan)} weeks remaining
          </p>
        </div>
        <div className="dashboard-plan-meta">
          <span>{PHASE_LABELS[week.phase]}</span>
          <strong>{week.total_km.toFixed(0)} km</strong>
          <span>{plan.plan.meta.level}</span>
        </div>
      </section>

      <div className="dashboard-main-grid">
        <section className="panel dashboard-next">
          <div className="dashboard-section-head">
            <div>
              <span className="muted">{nextIsToday ? "Today" : "Next run"}</span>
              <h2>{next ? SESSION_LABELS[next.session.type] : "No upcoming run"}</h2>
            </div>
            {next && <span className="tag">{dayLabel(next.session.day_index)} · {formatDate(next.session.date)}</span>}
          </div>

          {next ? (
            <>
              <p className="dashboard-session-title">{next.session.description}</p>
              <div className="dashboard-session-stats">
                {next.session.target_km && (
                  <span><MapPin size={15} /> {next.session.target_km.toFixed(1)} km</span>
                )}
                {next.session.target_duration_min && (
                  <span><Clock size={15} /> {next.session.target_duration_min} min</span>
                )}
                {next.session.hr_zone && (
                  <span><Heart size={15} /> {next.session.hr_zone}</span>
                )}
              </div>
              <p className="muted">{next.session.rationale}</p>
              <div className="button-row">
                <Link className="button primary" href={`/app/plans/${plan.id}/sessions/${next.weekIndex}-${next.session.day_index}`}>
                  View session
                </Link>
                <Link className="button ghost" href={`/app/plans/${plan.id}`}>
                  Full plan
                </Link>
              </div>
            </>
          ) : (
            <div className="empty compact-empty">
              <div>
                <CalendarCheck size={26} />
                <p>No unlogged runs remain in this plan.</p>
              </div>
            </div>
          )}
        </section>

        <aside className="dashboard-side">
          <div className="panel dashboard-attention">
            {status.tone === "warn" ? <AlertCircle size={18} /> : <CalendarCheck size={18} />}
            <div>
              <strong>{status.label}</strong>
              <span className="muted">{status.detail}</span>
            </div>
          </div>

          {feedbackTarget && (
            <Link className="panel dashboard-feedback" href={`/app/plans/${plan.id}/sessions/${feedbackTarget.weekIndex}-${feedbackTarget.dayIndex}`}>
              <Target size={18} />
              <div>
                <strong>Rate your latest workout</strong>
                <span className="muted">Your feedback can shape future sessions.</span>
              </div>
              <ChevronRight size={16} />
            </Link>
          )}
        </aside>
      </div>

      <div className="grid-3 dashboard-metrics">
        <div className="panel">
          <span className="muted">Weekly progress</span>
          <h2>{completedKm.toFixed(1)} / {week.total_km.toFixed(0)} km</h2>
        </div>
        <div className="panel">
          <span className="muted">Sessions this week</span>
          <h2>{loggedThisWeek} / {plannedThisWeek}</h2>
        </div>
        <div className="panel">
          <span className="muted">Next long run</span>
          <h2>{longRun?.session.target_km ? `${longRun.session.target_km.toFixed(1)} km` : "—"}</h2>
          {longRun && <span className="muted">{dayLabel(longRun.session.day_index)} · {formatDate(longRun.session.date)}</span>}
        </div>
        <div className="panel">
          <span className="muted">Latest adaptation</span>
          <h2>{latestAdaptation ? (RULE_LABELS[latestAdaptation.rule] ?? latestAdaptation.rule) : "None"}</h2>
        </div>
        <div className="panel">
          <span className="muted">Preference signal</span>
          <h2>{preferenceSignal(plan)}</h2>
        </div>
        <div className="panel">
          <span className="muted">Saved workouts</span>
          <h2>{workouts.length}</h2>
        </div>
      </div>

      <div className="grid-2 dashboard-lower">
        <section className="panel">
          <div className="dashboard-section-head">
            <h2>This week</h2>
            <Link className="button ghost compact" href={`/app/plans/${plan.id}`}>
              Open plan
            </Link>
          </div>
          <div className="dashboard-week-list">
            {week.sessions.map((session) => {
              const logged = completedKeys(plan.completedSessions, weekIndex).has(sessionKey(weekIndex, session.day_index));
              return (
                <Link
                  key={session.day_index}
                  className={`dashboard-week-row ${session.type === "rest" ? "rest" : ""}`}
                  href={session.type === "rest" ? `/app/plans/${plan.id}` : `/app/plans/${plan.id}/sessions/${weekIndex}-${session.day_index}`}
                >
                  <span>{dayLabel(session.day_index)}</span>
                  <strong>{SESSION_LABELS[session.type]}</strong>
                  <em>{session.target_km ? `${session.target_km.toFixed(1)} km` : session.target_duration_min ? `${session.target_duration_min} min` : "—"}</em>
                  {logged && <span className="tag active-tag">Logged</span>}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="dashboard-section-head">
            <h2>Recent activity</h2>
            <GitBranch size={18} />
          </div>
          {activity.length === 0 ? (
            <div className="empty compact-empty">
              <div>
                <Activity size={26} />
                <p>No activity recorded yet.</p>
              </div>
            </div>
          ) : (
            <div className="dashboard-activity-list">
              {activity.map((item) => {
                const content = (
                  <>
                    <div>
                      <strong>{item.label}</strong>
                      <span className="muted">{item.detail}</span>
                    </div>
                    <span className="muted">{formatDate(item.createdAt)}</span>
                  </>
                );
                return item.href ? (
                  <Link className="dashboard-activity-row" href={item.href} key={item.id}>
                    {content}
                  </Link>
                ) : (
                  <div className="dashboard-activity-row" key={item.id}>
                    {content}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [workouts, setWorkouts] = useState<SavedWorkout[]>([]);
  const [plans, setPlans] = useState<SavedPlan[]>([]);

  useEffect(() => {
    setWorkouts(getWorkouts());
    setPlans(getPlans().filter((p) => p.status !== "archived"));
  }, []);

  const activePlan = plans.find((p) => p.status === "active") ?? plans[0] ?? null;

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          <h1>Dashboard</h1>
          <p>Today&apos;s run, weekly progress, and recent plan changes.</p>
        </div>
        <div className="button-row">
          <Link className="button ghost" href="/app/plans/new">
            <CalendarRange size={18} />
            New plan
          </Link>
          <Link className="button primary" href="/app/new">
            <Plus size={18} />
            New workout
          </Link>
        </div>
      </div>

      {activePlan
        ? <ActivePlanDashboard plan={activePlan} workouts={workouts} />
        : <EmptyDashboard workoutsCount={workouts.length} />}
    </>
  );
}
