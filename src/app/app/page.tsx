"use client";

import { Activity, CalendarRange, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SavedWorkout } from "@/domain/workout-schema";
import type { SavedPlan } from "@/lib/plan-storage";
import { getPlans } from "@/lib/plan-storage";
import { getSettings, getWorkouts } from "@/lib/storage";

const GOAL_LABELS: Record<string, string> = {
  "5K": "5K",
  "10K": "10K",
  half: "Half marathon",
  marathon: "Marathon",
};

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

export default function DashboardPage() {
  const [workouts, setWorkouts] = useState<SavedWorkout[]>([]);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [settings, setSettings] = useState(getSettings());

  useEffect(() => {
    setWorkouts(getWorkouts());
    setSettings(getSettings());
    setPlans(getPlans().filter((p) => p.status !== "archived"));
  }, []);

  const activePlan = plans.find((p) => p.status === "active") ?? plans[0] ?? null;

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          <h1>Dashboard</h1>
          <p>Your training plans, workouts, and defaults.</p>
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

      {activePlan && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2>Active plan</h2>
            <Link className="button ghost compact" href="/app/plans">
              All plans
            </Link>
          </div>
          <Link className="saved-item" href={`/app/plans/${activePlan.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ flex: 1 }}>
              <strong>{GOAL_LABELS[activePlan.plan.meta.goal_race]} · {new Date(activePlan.plan.meta.goal_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</strong>
              <div className="muted">
                {activePlan.plan.meta.level} · Week {currentWeekIndex(activePlan) + 1} of {activePlan.plan.meta.weeks_total} · {weeksRemaining(activePlan)} weeks to go
              </div>
            </div>
            <ChevronRight size={16} style={{ color: "var(--muted)" }} />
          </Link>
        </section>
      )}

      {!activePlan && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="empty" style={{ minHeight: 100 }}>
            <div>
              <CalendarRange size={28} />
              <p>No active training plan.</p>
              <Link className="button primary" href="/app/plans/new">
                Build a plan
              </Link>
            </div>
          </div>
        </section>
      )}

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="panel">
          <span className="muted">Default easy pace</span>
          <h2>{settings.defaultEasyPace}/km</h2>
        </div>
        <div className="panel">
          <span className="muted">Cool-down pace</span>
          <h2>{settings.defaultCooldownPace}/km</h2>
        </div>
        <div className="panel">
          <span className="muted">Saved workouts</span>
          <h2>{workouts.length}</h2>
        </div>
      </div>

      <section className="panel">
        <h2>Recent workouts</h2>
        {workouts.length === 0 ? (
          <div className="empty">
            <div>
              <Activity size={34} />
              <p>No saved workouts yet.</p>
              <Link className="button primary" href="/app/new">
                Build the first one
              </Link>
            </div>
          </div>
        ) : (
          <div className="saved-list">
            {workouts.map((workout) => {
              const latest = workout.adjustments.at(-1);
              return (
                <Link className="saved-item" href={`/app/workouts/${workout.id}`} key={workout.id}>
                  <div>
                    <strong>{workout.title}</strong>
                    <div className="muted">
                      {latest?.adjustedWorkout.steps.length ?? 0} steps · updated{" "}
                      {new Date(workout.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="tag">{latest?.adjustedWorkout.lane ?? "draft"}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
