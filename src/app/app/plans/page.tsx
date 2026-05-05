"use client";

import { Archive, CalendarRange, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SavedPlan } from "@/lib/plan-storage";
import { getPlans, updatePlanStatus } from "@/lib/plan-storage";

const GOAL_LABELS: Record<string, string> = {
  "5K": "5K",
  "10K": "10K",
  half: "Half marathon",
  marathon: "Marathon",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

function weeksRemaining(plan: SavedPlan): number {
  const goal = new Date(plan.plan.meta.goal_date);
  const today = new Date();
  return Math.max(0, Math.ceil((goal.getTime() - today.getTime()) / (7 * 86400000)));
}

export default function PlansPage() {
  const [plans, setPlans] = useState<SavedPlan[]>([]);

  function refresh() {
    setPlans(getPlans());
  }

  useEffect(() => {
    refresh();
  }, []);

  function handleStatusToggle(plan: SavedPlan) {
    const next: SavedPlan["status"] = plan.status === "archived" ? "active" : "archived";
    updatePlanStatus(plan.id, next);
    refresh();
  }

  const active = plans.filter((p) => p.status !== "archived");
  const archived = plans.filter((p) => p.status === "archived");

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          <h1>Training plans</h1>
          <p>Race builds Pacevo can adapt as you train.</p>
        </div>
        <Link className="button primary" href="/app/plans/new">
          <Plus size={18} />
          New plan
        </Link>
      </div>

      {plans.length === 0 ? (
        <section className="panel">
          <div className="empty">
            <div>
              <CalendarRange size={34} />
              <p>No training plans yet.</p>
              <Link className="button primary" href="/app/plans/new">
                Build your first plan
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          {active.length > 0 && (
            <section className="panel" style={{ marginBottom: 16 }}>
              <h2>Active</h2>
              <div className="saved-list">
                {active.map((p) => (
                  <PlanRow key={p.id} plan={p} weeksLeft={weeksRemaining(p)} onToggleArchive={() => handleStatusToggle(p)} />
                ))}
              </div>
            </section>
          )}
          {archived.length > 0 && (
            <section className="panel">
              <h2>Archived</h2>
              <div className="saved-list">
                {archived.map((p) => (
                  <PlanRow key={p.id} plan={p} weeksLeft={weeksRemaining(p)} onToggleArchive={() => handleStatusToggle(p)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

function PlanRow({
  plan,
  weeksLeft,
  onToggleArchive,
}: {
  plan: SavedPlan;
  weeksLeft: number;
  onToggleArchive: () => void;
}) {
  const { meta } = plan.plan;
  const isArchived = plan.status === "archived";
  return (
    <div className="saved-item" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Link
        href={`/app/plans/${plan.id}`}
        style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}
      >
        <div style={{ flex: 1 }}>
          <strong>
            {GOAL_LABELS[meta.goal_race]} · {new Date(meta.goal_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </strong>
          <div className="muted">
            {meta.level} · {meta.weeks_total} weeks{isArchived ? "" : ` · ${weeksLeft} weeks remaining`}
          </div>
        </div>
        <span className={`tag${plan.status === "active" ? " active-tag" : ""}`}>
          {STATUS_LABELS[plan.status]}
        </span>
      </Link>
      <button
        className="button ghost icon-button"
        title={isArchived ? "Restore plan" : "Archive plan"}
        onClick={(e) => { e.preventDefault(); onToggleArchive(); }}
      >
        {isArchived ? <RotateCcw size={15} /> : <Archive size={15} />}
      </button>
    </div>
  );
}
