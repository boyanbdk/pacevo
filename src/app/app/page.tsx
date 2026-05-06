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
import type { SavedWorkout } from "@/domain/workout-schema";
import { BRAND_NAME } from "@/lib/brand";
import type { SavedPlan } from "@/lib/plan-storage";
import { getPlans } from "@/lib/plan-storage";
import { getWorkouts } from "@/lib/storage";
import {
  GOAL_LABELS,
  PHASE_LABELS,
  SESSION_LABELS,
  RULE_LABELS,
  type ActivityItem,
  completedKeys,
  completedKmForWeek,
  currentWeekIndex,
  dateKey,
  dayLabel,
  formatDate,
  formatStravaSyncStatus,
  latestFeedbackNeeded,
  nextLongRun,
  nextRun,
  planStatus,
  plannedRunSessions,
  preferenceSignal,
  recentActivity,
  sessionKey,
  startOfToday,
  stravaActivityItems,
  weeksRemaining,
} from "@/lib/training-dashboard";
import type { ImportedActivity } from "@/domain/training-plan/activity-import";

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
            Build a race plan first, then {BRAND_NAME} will show today&apos;s workout, weekly progress, and what changes as you train.
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

type StravaActivityState =
  | {
      status: "idle" | "loading";
      connected: boolean;
      activities: ImportedActivity[];
      lastSyncedAt: string | null;
      lastSyncError: string | null;
      error: null;
    }
  | {
      status: "ready";
      connected: boolean;
      activities: ImportedActivity[];
      lastSyncedAt: string | null;
      lastSyncError: string | null;
      error: null;
    }
  | {
      status: "error";
      connected: boolean;
      activities: ImportedActivity[];
      lastSyncedAt: string | null;
      lastSyncError: string | null;
      error: string;
    };

function ActivePlanDashboard({ plan, workouts }: { plan: SavedPlan; workouts: SavedWorkout[] }) {
  const [strava, setStrava] = useState<StravaActivityState>({
    status: "idle",
    connected: false,
    activities: [],
    lastSyncedAt: null,
    lastSyncError: null,
    error: null,
  });
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
  const localActivity = recentActivity(plan, workouts);
  const stravaItems = stravaActivityItems(plan, strava.activities);
  const activity = [...localActivity, ...stravaItems]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  async function loadStravaActivities(sync = false) {
    setStrava((prev) => ({ ...prev, status: "loading", error: null }));
    try {
      const response = await fetch(sync ? "/api/integrations/strava/activities/sync" : "/api/integrations/strava/activities", {
        method: sync ? "POST" : "GET",
        cache: "no-store",
      });
      const payload = await response.json() as {
        connected?: boolean;
        lastSyncedAt?: string | null;
        lastSyncError?: string | null;
        activities?: ImportedActivity[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load Strava activities.");
      }
      setStrava({
        status: "ready",
        connected: Boolean(payload.connected),
        activities: payload.activities ?? [],
        lastSyncedAt: payload.lastSyncedAt ?? null,
        lastSyncError: payload.lastSyncError ?? payload.error ?? null,
        error: null,
      });
    } catch (error) {
      setStrava((prev) => ({
        ...prev,
        status: "error",
        error: error instanceof Error ? error.message : "Could not load Strava activities.",
      }));
    }
  }

  useEffect(() => {
    loadStravaActivities(false);
  }, []);

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
                <span className="muted">{BRAND_NAME} uses feedback to shape future sessions.</span>
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
            <div>
              <h2>Recent activity</h2>
              {strava.connected && (
                <span className="muted">
                  {strava.status === "loading" ? "Loading Strava..." : formatStravaSyncStatus(strava.lastSyncedAt, strava.activities.length)}
                </span>
              )}
              {(strava.status === "error" || strava.lastSyncError) && <span className="muted">{strava.error ?? strava.lastSyncError}</span>}
            </div>
            <button
              className="button ghost compact"
              type="button"
              onClick={() => loadStravaActivities(true)}
              disabled={strava.status === "loading"}
            >
              <GitBranch size={16} />
              Sync
            </button>
          </div>
          {activity.length === 0 ? (
            <div className="empty compact-empty">
              <div>
                <Activity size={26} />
                <p>{strava.connected ? "No Strava runs found yet." : "No activity recorded yet."}</p>
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
          <p>Today&apos;s run, weekly progress, and what {BRAND_NAME} learned from your recent training.</p>
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
