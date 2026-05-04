"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock,
  Heart,
  MapPin,
  RefreshCw,
  Star,
  ThumbsDown,
  ThumbsUp,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPace, renderIntensity } from "@/domain/training-plan";
import { runAdaptations } from "@/domain/training-plan/adapt-plan";
import type { IntensityMode, PlannedSession, TrainingWeek } from "@/domain/training-plan/types";
import type { WorkoutFeedbackReason, WorkoutFeedbackType } from "@/domain/training-plan/workout-preferences";
import type { CompletedSession, SavedPlan } from "@/lib/plan-storage";
import {
  applyAdaptation,
  getCompletedSession,
  getPlan,
  getWorkoutFeedbackForSession,
  logSession,
  recordWorkoutFeedback,
} from "@/lib/plan-storage";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_LABELS: Record<string, string> = {
  easy: "Easy run",
  long: "Long run",
  tempo: "Tempo run",
  interval: "Interval session",
  repetition: "Repetition session",
  marathon_pace: "Marathon pace run",
  recovery: "Recovery run",
  strides: "Strides",
  fartlek: "Fartlek",
  hills: "Hill session",
  cross: "Cross-training",
  rest: "Rest day",
};

const SESSION_COLORS: Record<string, string> = {
  easy: "var(--brand-2)",
  long: "var(--brand)",
  tempo: "#ff9f43",
  interval: "#ff6b6b",
  repetition: "#ff6b6b",
  marathon_pace: "#a29bfe",
  recovery: "#74b9ff",
  strides: "#fd79a8",
  fartlek: "#fdcb6e",
  hills: "#e17055",
  cross: "#6c5ce7",
  rest: "var(--line)",
};

const PHASE_LABELS: Record<string, string> = {
  base: "Base", build: "Build", peak: "Peak", taper: "Taper",
};

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const MODE_LABELS: { value: IntensityMode; label: string }[] = [
  { value: "pace", label: "Pace" },
  { value: "rpe",  label: "RPE" },
  { value: "hr",   label: "Heart rate" },
];

const DISLIKE_REASONS: { value: WorkoutFeedbackReason; label: string }[] = [
  { value: "too_hard", label: "Too hard" },
  { value: "too_boring", label: "Too boring" },
  { value: "too_long", label: "Too long" },
  { value: "too_much_speed", label: "Too much speed" },
  { value: "too_structured", label: "Too structured" },
  { value: "schedule_fit", label: "Did not fit schedule" },
  { value: "other", label: "Other" },
];

// ---------------------------------------------------------------------------
// Log form
// ---------------------------------------------------------------------------

type LogForm = {
  actualKm: string;
  actualDurationMin: string;
  avgHR: string;
  maxHR: string;
  rpe: string;
  note: string;
};

const EMPTY_LOG: LogForm = {
  actualKm: "", actualDurationMin: "", avgHR: "", maxHR: "", rpe: "", note: "",
};

function LogSessionForm({
  plan,
  weekIndex,
  dayIndex,
  session,
  existing,
  onSaved,
}: {
  plan: SavedPlan;
  weekIndex: number;
  dayIndex: number;
  session: PlannedSession;
  existing: CompletedSession | undefined;
  onSaved: (updated: SavedPlan) => void;
}) {
  const [form, setForm] = useState<LogForm>(
    existing
      ? {
          actualKm: existing.actualKm?.toString() ?? "",
          actualDurationMin: existing.actualDurationMin?.toString() ?? "",
          avgHR: existing.avgHR?.toString() ?? "",
          maxHR: existing.maxHR?.toString() ?? "",
          rpe: existing.rpe?.toString() ?? "",
          note: existing.note ?? "",
        }
      : EMPTY_LOG,
  );
  const [saving, setSaving] = useState(false);
  const [adaptationMessage, setAdaptationMessage] = useState<string | null>(null);

  function patch(partial: Partial<LogForm>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function handleSave() {
    setSaving(true);
    try {
      logSession(plan.id, {
        weekIndex,
        dayIndex,
        date: session.date,
        actualKm: form.actualKm ? Number(form.actualKm) : null,
        actualDurationMin: form.actualDurationMin ? Number(form.actualDurationMin) : null,
        avgHR: form.avgHR ? Number(form.avgHR) : null,
        maxHR: form.maxHR ? Number(form.maxHR) : null,
        rpe: form.rpe ? Number(form.rpe) : null,
        note: form.note,
        source: "manual",
      });

      const refreshed = getPlan(plan.id)!;
      const today = new Date();
      const startDate = new Date(refreshed.plan.meta.start_date);
      const currentWeekIndex = Math.min(
        Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / (7 * 86400000))),
        refreshed.plan.weeks.length - 1,
      );

      const result = runAdaptations(
        refreshed.plan,
        refreshed.completedSessions,
        refreshed.inputs,
        currentWeekIndex,
      );

      if (result) {
        const { plan: adapted } = applyAdaptation(plan.id, result.newPlan, {
          rule: result.rule,
          explanation: result.explanation,
          triggeredBySessionIds: result.triggeredBySessionIds,
          firedAt: new Date().toISOString(),
        });
        setAdaptationMessage(result.explanation);
        onSaved(adapted);
      } else {
        onSaved(refreshed);
      }
    } finally {
      setSaving(false);
    }
  }

  if (session.type === "rest") return null;

  return (
    <div className="panel log-form" style={{ marginTop: 18 }}>
      <h3 style={{ margin: "0 0 16px" }}>
        {existing ? "Logged ✓" : "Log this session"}
      </h3>

      {adaptationMessage && (
        <div className="adapt-banner">
          <CheckCircle size={16} />
          <div>
            <strong>Plan adapted</strong>
            <p>{adaptationMessage}</p>
          </div>
        </div>
      )}

      <div className="log-form-grid">
        <div className="field">
          <label className="field-label">Distance (km)</label>
          <input
            type="number"
            className="input"
            placeholder={session.target_km?.toFixed(1) ?? "km"}
            step="0.1"
            min="0"
            max="200"
            value={form.actualKm}
            onChange={(e) => patch({ actualKm: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label">Duration (min)</label>
          <input
            type="number"
            className="input"
            placeholder={session.target_duration_min?.toString() ?? "min"}
            min="0"
            max="600"
            value={form.actualDurationMin}
            onChange={(e) => patch({ actualDurationMin: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label">Avg HR (bpm)</label>
          <input
            type="number"
            className="input"
            placeholder="optional"
            min="50"
            max="250"
            value={form.avgHR}
            onChange={(e) => patch({ avgHR: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label">RPE (1–10)</label>
          <input
            type="number"
            className="input"
            placeholder="1–10"
            min="1"
            max="10"
            value={form.rpe}
            onChange={(e) => patch({ rpe: e.target.value })}
          />
        </div>
      </div>

      <div className="field" style={{ marginTop: 10 }}>
        <label className="field-label">Notes</label>
        <input
          type="text"
          className="input"
          placeholder="How did it feel?"
          value={form.note}
          onChange={(e) => patch({ note: e.target.value })}
        />
      </div>

      <div className="button-row" style={{ marginTop: 14 }}>
        <button
          className="button primary"
          onClick={handleSave}
          disabled={saving || (!form.actualKm && !form.actualDurationMin)}
        >
          <CheckCircle size={15} />
          {saving ? "Saving…" : existing ? "Update log" : "Save log"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intensity mode switcher
// ---------------------------------------------------------------------------

function ModeSwitcher({
  mode,
  onChange,
}: {
  mode: IntensityMode;
  onChange: (m: IntensityMode) => void;
}) {
  return (
    <div className="segmented" style={{ gridTemplateColumns: "repeat(3, 1fr)", maxWidth: 320 }}>
      {MODE_LABELS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={mode === value ? "selected" : ""}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function FeedbackControls({
  planId,
  sessionId,
  session,
  onSaved,
}: {
  planId: string;
  sessionId: string;
  session: PlannedSession;
  onSaved: (updated: SavedPlan) => void;
}) {
  const [selectedReason, setSelectedReason] = useState<WorkoutFeedbackReason>("too_hard");
  const latestFeedback = getWorkoutFeedbackForSession(planId, sessionId);
  const latestType = latestFeedback?.type;
  const canRecord = Boolean(session.recipe_id && session.recipe_family);

  function save(type: WorkoutFeedbackType, reason?: WorkoutFeedbackReason) {
    recordWorkoutFeedback(planId, sessionId, session, type, reason);
    const refreshed = getPlan(planId);
    if (refreshed) onSaved(refreshed);
  }

  if (session.type === "rest") return null;

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: "0 0 4px" }}>Feedback</h3>
          <p className="muted" style={{ margin: 0 }}>
            This will bias future workout selection inside the plan guardrails.
          </p>
        </div>
        {latestFeedback && <span className="tag">Last: {latestFeedback.type}</span>}
      </div>

      {!canRecord && (
        <div className="plan-warn" style={{ marginBottom: 12 }}>
          <AlertCircle size={15} />
          <span>This older session has no recipe metadata, so feedback cannot be learned from it.</span>
        </div>
      )}

      <div className="button-row">
        <button
          type="button"
          className={`button ghost ${latestType === "like" ? "selected-action" : ""}`}
          disabled={!canRecord}
          onClick={() => save("like")}
        >
          <ThumbsUp size={16} />
          Like
        </button>
        <button
          type="button"
          className={`button ghost ${latestType === "favourite" ? "selected-action" : ""}`}
          disabled={!canRecord}
          onClick={() => save(latestType === "favourite" ? "unfavourite" : "favourite")}
        >
          <Star size={16} />
          {latestType === "favourite" ? "Unfavourite" : "Favourite"}
        </button>
      </div>

      <div className="button-row" style={{ marginTop: 10 }}>
        <select
          className="select"
          value={selectedReason}
          disabled={!canRecord}
          onChange={(event) => setSelectedReason(event.target.value as WorkoutFeedbackReason)}
          style={{ maxWidth: 220 }}
        >
          {DISLIKE_REASONS.map((reason) => (
            <option key={reason.value} value={reason.value}>{reason.label}</option>
          ))}
        </select>
        <button
          type="button"
          className={`button ghost ${latestType === "dislike" ? "selected-action" : ""}`}
          disabled={!canRecord}
          onClick={() => save("dislike", selectedReason)}
        >
          <ThumbsDown size={16} />
          Dislike
        </button>
        <button type="button" className="button ghost" disabled title="Similar workout swaps are Phase 6.">
          <RefreshCw size={16} />
          Switch similar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SessionDetailPage() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [intensityMode, setIntensityMode] = useState<IntensityMode>("pace");

  useEffect(() => {
    const p = getPlan(id);
    setPlan(p ?? null);
    setLoaded(true);
    // Initialise mode from plan preference
    if (p?.plan.meta.intensity_mode) {
      setIntensityMode(p.plan.meta.intensity_mode);
    }
  }, [id]);

  if (!loaded) return null;
  if (!plan) notFound();

  const parts = sessionId.split("-");
  const weekIndex = parseInt(parts[0], 10);
  const dayIndex = parseInt(parts[1], 10);

  const week: TrainingWeek | undefined = plan.plan.weeks[weekIndex];
  if (!week) notFound();

  const session: PlannedSession | undefined = week.sessions.find((s) => s.day_index === dayIndex);
  if (!session) notFound();

  const existing = getCompletedSession(id, weekIndex, dayIndex);
  const paces = plan.plan.paces;
  const color = SESSION_COLORS[session.type] ?? "var(--muted)";

  const intensity = session.type !== "rest"
    ? renderIntensity(
        session.type,
        session.pace_low_s_km,
        session.pace_high_s_km,
        session.hr_zone,
        session.target_rpe,
        plan.plan.hr_zones,
        intensityMode,
      )
    : null;

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          <Link
            className="button ghost"
            href={`/app/plans/${id}`}
            style={{ marginBottom: 6, display: "inline-flex" }}
          >
            <ArrowLeft size={16} />
            Week {weekIndex + 1}
          </Link>
          <h1 style={{ color }}>
            {SESSION_LABELS[session.type]}
            {existing && <span className="session-logged-badge">Logged</span>}
          </h1>
          <p>
            {DAY_NAMES[session.day_index - 1]} · Week {weekIndex + 1} · {PHASE_LABELS[week.phase]}
          </p>
        </div>
      </div>

      {/* Intensity mode switcher */}
      {session.type !== "rest" && (
        <div style={{ marginBottom: 16 }}>
          <ModeSwitcher mode={intensityMode} onChange={setIntensityMode} />
          {intensity?.recommendedMode !== intensityMode && (
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Recommended for this session: <strong>{intensity?.recommendedMode}</strong>
            </p>
          )}
        </div>
      )}

      {/* HR lag warning */}
      {intensity?.warning && (
        <div className="plan-warn" style={{ marginBottom: 14 }}>
          <AlertCircle size={15} />
          <span>{intensity.warning}</span>
        </div>
      )}

      {/* Key metrics */}
      <div className="grid-3" style={{ marginBottom: 18 }}>
        {session.target_km && (
          <div className="panel session-metric">
            <MapPin size={18} style={{ color }} />
            <strong>{session.target_km.toFixed(1)} km</strong>
            <span className="muted">Distance</span>
          </div>
        )}
        {session.target_duration_min && (
          <div className="panel session-metric">
            <Clock size={18} style={{ color }} />
            <strong>{session.target_duration_min} min</strong>
            <span className="muted">Duration</span>
          </div>
        )}

        {/* Primary intensity metric — large */}
        {intensity && (
          <div className="panel session-metric" style={{ gridColumn: session.target_km ? undefined : "1 / -1" }}>
            {intensityMode === "pace" && <Zap size={18} style={{ color }} />}
            {intensityMode === "hr" && <Heart size={18} style={{ color }} />}
            {intensityMode === "rpe" && (
              <span style={{ fontSize: 18, fontWeight: 900, color }}>RPE</span>
            )}
            <strong>{intensity.primaryValue}</strong>
            <span className="muted">{intensity.primaryLabel}</span>
          </div>
        )}
      </div>

      {/* Secondary intensity metrics */}
      {intensity && intensity.secondary.length > 0 && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="pace-ref-grid">
            {intensity.secondary.map((item) => (
              <div key={item.label}>
                <span className="muted">{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actual results (if logged) */}
      {existing && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h3 style={{ margin: "0 0 12px" }}>Actual</h3>
          <div className="grid-3">
            {existing.actualKm && (
              <div className="session-metric">
                <strong>{existing.actualKm.toFixed(1)} km</strong>
                <span className="muted">Distance</span>
              </div>
            )}
            {existing.actualDurationMin && (
              <div className="session-metric">
                <strong>{existing.actualDurationMin} min</strong>
                <span className="muted">Duration</span>
              </div>
            )}
            {existing.avgHR && (
              <div className="session-metric">
                <strong>{existing.avgHR} bpm</strong>
                <span className="muted">Avg HR</span>
              </div>
            )}
            {existing.rpe && (
              <div className="session-metric">
                <strong>{existing.rpe}/10</strong>
                <span className="muted">RPE</span>
              </div>
            )}
          </div>
          {existing.note && <p className="muted" style={{ margin: "10px 0 0" }}>{existing.note}</p>}
        </div>
      )}

      <FeedbackControls
        planId={id}
        sessionId={sessionId}
        session={session}
        onSaved={setPlan}
      />

      {/* Description & rationale */}
      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="panel">
          <h3 style={{ margin: "0 0 10px" }}>Session</h3>
          <p style={{ margin: 0, lineHeight: 1.6 }}>{session.description}</p>
        </div>
        <div className="panel">
          <h3 style={{ margin: "0 0 10px" }}>Why</h3>
          <p style={{ margin: 0, lineHeight: 1.6, color: "var(--muted)" }}>{session.rationale}</p>
        </div>
      </div>

      {/* Structure */}
      {(session.warmup || session.main_set || session.cooldown) && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h3 style={{ margin: "0 0 14px" }}>Structure</h3>
          <div className="session-structure">
            {session.warmup && (
              <div className="session-block">
                <span className="session-block-label">Warm-up</span>
                <p>{session.warmup}</p>
              </div>
            )}
            {session.main_set && (
              <div className="session-block main">
                <span className="session-block-label">Main set</span>
                <p>{session.main_set}</p>
              </div>
            )}
            {session.cooldown && (
              <div className="session-block">
                <span className="session-block-label">Cool-down</span>
                <p>{session.cooldown}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pace reference */}
      {paces.E_low && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h3 style={{ margin: "0 0 14px" }}>Pace reference</h3>
          <div className="pace-ref-grid">
            <div>
              <span className="muted">Easy</span>
              <strong>{formatPace(paces.E_low)} – {formatPace(paces.E_high)}</strong>
            </div>
            {paces.M && (
              <div>
                <span className="muted">Marathon pace</span>
                <strong>{formatPace(paces.M)}</strong>
              </div>
            )}
            {paces.T && (
              <div>
                <span className="muted">Threshold</span>
                <strong>{formatPace(paces.T)}</strong>
              </div>
            )}
            {paces.I && (
              <div>
                <span className="muted">Interval</span>
                <strong>{formatPace(paces.I)}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Log form */}
      <LogSessionForm
        plan={plan}
        weekIndex={weekIndex}
        dayIndex={dayIndex}
        session={session}
        existing={existing}
        onSaved={setPlan}
      />
    </>
  );
}
