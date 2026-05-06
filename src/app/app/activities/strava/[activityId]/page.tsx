"use client";

import { AlertCircle, ArrowLeft, CalendarDays, Clock, ExternalLink, Heart, MapPin, Route, Timer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { matchImportedActivities, type ActivityMatch } from "@/domain/training-plan/activity-import";
import type { StravaActivityDetailPayload } from "@/lib/server/strava-activity-payload";
import { getPlans, type SavedPlan } from "@/lib/plan-storage";
import { formatFullPlanDate } from "@/lib/plan-dates";
import {
  importActivityIntoPlan,
  markStravaActivityImported,
  targetFromActivityMatch,
} from "@/lib/activity-plan-import";

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

type LinkedSession = {
  href: string;
  label: string;
};

type ImportCandidate = {
  plan: SavedPlan;
  match: ActivityMatch;
};

function rawString(raw: unknown, key: string): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function formatStartedAt(activity: StravaActivityDetailPayload): string {
  const rawLocalStart = rawString(activity.raw, "start_date_local");
  const startedAt = new Date(rawLocalStart ?? activity.startedAt);
  if (!Number.isFinite(startedAt.getTime())) return formatFullPlanDate(activity.date);

  return `${formatFullPlanDate(activity.date)} · ${startedAt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function findLinkedSession(activity: StravaActivityDetailPayload, plans: SavedPlan[]): LinkedSession | null {
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

  return null;
}

function importCandidateForActivePlan(activity: StravaActivityDetailPayload, plans: SavedPlan[]): ImportCandidate | null {
  const plan = plans.find((candidate) => candidate.status === "active");
  if (!plan) return null;
  const [match] = matchImportedActivities(plan.plan, [activity], plan.completedSessions);
  if (!match || match.status === "duplicate" || match.status === "unmatched") return null;
  return { plan, match };
}

export default function StravaActivityDetailPage() {
  const { activityId } = useParams<{ activityId: string }>();
  const [state, setState] = useState<ActivityDetailState>({ status: "loading", activity: null, error: null });
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [importing, setImporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  const linkedSession = useMemo(
    () => state.activity ? findLinkedSession(state.activity, plans) : null,
    [plans, state.activity],
  );
  const importCandidate = useMemo(
    () => state.activity && !linkedSession ? importCandidateForActivePlan(state.activity, plans) : null,
    [linkedSession, plans, state.activity],
  );

  async function importToPlan() {
    if (!state.activity || !importCandidate) return;
    const target = targetFromActivityMatch(importCandidate.match);
    if (!target) return;

    setImporting(true);
    setActionError(null);
    setMessage(null);
    try {
      const updated = importActivityIntoPlan(importCandidate.plan, state.activity, target);
      setPlans((prev) => prev.map((plan) => plan.id === updated.id ? updated : plan));
      await markStravaActivityImported(state.activity, true);
      setMessage("Activity imported.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Activity imported locally, but Strava status could not be updated.");
    } finally {
      setImporting(false);
    }
  }

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
          {linkedSession && (
            <Link className="button primary" href={linkedSession.href}>
              {linkedSession.label}
            </Link>
          )}
          {!linkedSession && importCandidate && (
            <button className="button primary" type="button" onClick={importToPlan} disabled={importing}>
              {importing ? "Importing..." : "Import to plan"}
            </button>
          )}
          {!linkedSession && !importCandidate && plans.find((plan) => plan.status === "active") && (
            <Link className="button primary" href={`/app/plans/${plans.find((plan) => plan.status === "active")!.id}`}>
              Match in plan
            </Link>
          )}
          <a
            className="button ghost"
            href={`https://www.strava.com/activities/${encodeURIComponent(activity.providerActivityId)}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} />
            Open in Strava
          </a>
        </div>
      </div>

      {(message || actionError) && (
        <div className={actionError ? "plan-warn" : "adapt-banner"} style={{ marginBottom: 0 }}>
          {actionError ?? message}
        </div>
      )}

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
          <strong>{formatStartedAt(activity)}</strong>
          <span className="muted">Started</span>
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
        <div className="panel session-metric">
          <Route size={18} />
          <strong>{activity.sportType ?? "Activity"}</strong>
          <span className="muted">Sport type</span>
        </div>
        <div className="panel session-metric">
          <CalendarDays size={18} />
          <strong>{activity.importedIntoPlanAt ? "Imported" : "Stored only"}</strong>
          <span className="muted">Plan import</span>
        </div>
      </section>
    </div>
  );
}
