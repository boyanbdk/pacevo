"use client";

import { AlertCircle, ArrowLeft, CalendarDays, Clock, Heart, MapPin, Route, Timer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { StravaActivityDetailPayload } from "@/lib/server/strava-activity-payload";
import { getPlans, type SavedPlan } from "@/lib/plan-storage";
import { formatFullPlanDate } from "@/lib/plan-dates";

type ActivityDetailState =
  | { status: "loading"; activity: null; error: null }
  | { status: "ready"; activity: StravaActivityDetailPayload; error: null }
  | { status: "error"; activity: null; error: string };

function formatPace(distanceKm: number, durationMin: number): string {
  if (distanceKm <= 0 || durationMin <= 0) return "—";
  const secondsPerKm = Math.round((durationMin * 60) / distanceKm);
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = String(secondsPerKm % 60).padStart(2, "0");
  return `${minutes}:${seconds} /km`;
}

function formatMinutes(value: number | null | undefined): string {
  return value ? `${Math.round(value)} min` : "—";
}

function findPlanLink(activity: StravaActivityDetailPayload, plans: SavedPlan[]): { href: string; label: string } | null {
  for (const plan of plans.filter((candidate) => candidate.status === "active")) {
    const completed = plan.completedSessions.find(
      (session) =>
        session.source === "strava" &&
        (
          session.providerActivityId === activity.providerActivityId ||
          (
            !session.providerActivityId &&
            session.date === activity.date &&
            session.actualKm !== null &&
            Math.abs(session.actualKm - activity.distanceKm) < 0.02
          )
        ),
    );
    if (completed) {
      return {
        href: `/app/plans/${plan.id}/sessions/${completed.weekIndex}-${completed.dayIndex}`,
        label: "Open linked session",
      };
    }
  }

  const active = plans.find((plan) => plan.status === "active");
  return active ? { href: `/app/plans/${active.id}`, label: "Match to plan" } : null;
}

export default function StravaActivityDetailPage() {
  const { activityId } = useParams<{ activityId: string }>();
  const [state, setState] = useState<ActivityDetailState>({ status: "loading", activity: null, error: null });
  const [plans, setPlans] = useState<SavedPlan[]>([]);

  useEffect(() => {
    setPlans(getPlans());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadActivity() {
      setState({ status: "loading", activity: null, error: null });
      try {
        const response = await fetch(`/api/integrations/strava/activities/${encodeURIComponent(activityId)}`, {
          cache: "no-store",
        });
        const payload = await response.json() as { activity?: StravaActivityDetailPayload; error?: string };
        if (!response.ok || !payload.activity) {
          throw new Error(payload.error ?? "Could not load this Strava activity.");
        }
        if (!cancelled) setState({ status: "ready", activity: payload.activity, error: null });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            activity: null,
            error: error instanceof Error ? error.message : "Could not load this Strava activity.",
          });
        }
      }
    }

    loadActivity();
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  const planLink = useMemo(
    () => state.activity ? findPlanLink(state.activity, plans) : null,
    [plans, state.activity],
  );

  if (state.status === "loading") {
    return (
      <div className="panel activity-detail-empty">
        <Route size={24} />
        <p className="muted">Loading Strava activity...</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="panel activity-detail-empty">
        <AlertCircle size={24} />
        <p>{state.error}</p>
        <Link className="button ghost" href="/app">
          <ArrowLeft size={16} />
          Back to dashboard
        </Link>
      </div>
    );
  }

  const activity = state.activity;
  const pace = formatPace(activity.distanceKm, activity.durationMin);

  return (
    <div className="activity-detail-stack">
      <div className="page-header">
        <div className="page-title">
          <Link className="button ghost" href="/app" style={{ marginBottom: 6, display: "inline-flex" }}>
            <ArrowLeft size={16} />
            Dashboard
          </Link>
          <h1>{activity.name}</h1>
          <p>{formatFullPlanDate(activity.date)} · Strava {activity.sportType ?? "activity"}</p>
        </div>
        <div className="button-row">
          {planLink && (
            <Link className="button primary" href={planLink.href}>
              {planLink.label}
            </Link>
          )}
        </div>
      </div>

      <section className="activity-hero panel">
        <div>
          <span className="muted">Distance</span>
          <strong>{activity.distanceKm.toFixed(2)} km</strong>
        </div>
        <div>
          <span className="muted">Pace</span>
          <strong>{pace}</strong>
        </div>
        <div>
          <span className="muted">Duration</span>
          <strong>{formatMinutes(activity.durationMin)}</strong>
        </div>
      </section>

      <section className="grid-3 activity-metrics">
        <div className="panel session-metric">
          <CalendarDays size={18} />
          <strong>{formatFullPlanDate(activity.date)}</strong>
          <span className="muted">Date</span>
        </div>
        <div className="panel session-metric">
          <Clock size={18} />
          <strong>{formatMinutes(activity.movingTimeMin ?? activity.durationMin)}</strong>
          <span className="muted">Moving time</span>
        </div>
        <div className="panel session-metric">
          <Timer size={18} />
          <strong>{formatMinutes(activity.elapsedTimeMin)}</strong>
          <span className="muted">Elapsed time</span>
        </div>
        <div className="panel session-metric">
          <Heart size={18} />
          <strong>{activity.avgHR ? `${activity.avgHR} bpm` : "—"}</strong>
          <span className="muted">Avg HR</span>
        </div>
        <div className="panel session-metric">
          <Heart size={18} />
          <strong>{activity.maxHR ? `${activity.maxHR} bpm` : "—"}</strong>
          <span className="muted">Max HR</span>
        </div>
        <div className="panel session-metric">
          <MapPin size={18} />
          <strong>{activity.providerActivityId}</strong>
          <span className="muted">Strava ID</span>
        </div>
      </section>
    </div>
  );
}
