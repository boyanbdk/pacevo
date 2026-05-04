"use client";

import { ArrowLeft, ChevronRight, FileUp, GitBranch, History, LayoutGrid, Target, X, Zap } from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPace } from "@/domain/training-plan";
import { runAdaptations } from "@/domain/training-plan/adapt-plan";
import { matchImportedActivities, parseActivityFile, type ActivityMatch, type ImportedActivity } from "@/domain/training-plan/activity-import";
import type { TrainingWeek } from "@/domain/training-plan/types";
import type { AdaptationEvent, CompletedSession, PlanVersion, SavedPlan } from "@/lib/plan-storage";
import { applyAdaptation, getPlan, logSession } from "@/lib/plan-storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const SESSION_LABELS: Record<string, string> = {
  easy: "Easy",
  long: "Long",
  tempo: "Tempo",
  interval: "Intervals",
  repetition: "Reps",
  marathon_pace: "MP",
  recovery: "Recovery",
  strides: "Strides",
  fartlek: "Fartlek",
  hills: "Hills",
  cross: "Cross",
  rest: "Rest",
};

const PHASE_LABELS: Record<string, string> = {
  base: "Base",
  build: "Build",
  peak: "Peak",
  taper: "Taper",
};

const GOAL_LABELS: Record<string, string> = {
  "5K": "5K", "10K": "10K", half: "Half marathon", marathon: "Marathon",
};

const RULE_LABELS: Record<string, string> = {
  ACWR_CAP: "Load cap",
  RHR_ELEVATED: "Resting HR elevated",
  AEROBIC_DEFICIT: "Aerobic deficit",
  MISSED_SESSION: "Missed session",
  VDOT_UPDATE: "Fitness update",
  INJURY_FLAG: "Injury flag",
};

const RULE_COLORS: Record<string, string> = {
  ACWR_CAP: "var(--amber)",
  RHR_ELEVATED: "#ff6b6b",
  AEROBIC_DEFICIT: "var(--brand-2)",
  MISSED_SESSION: "var(--muted)",
  VDOT_UPDATE: "var(--brand)",
  INJURY_FLAG: "#ff6b6b",
};

const DAY_ABBRS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmtDist(km: number | null): string {
  if (km === null || km === 0) return "—";
  return `${km.toFixed(1)} km`;
}

function countLoggedSessions(sessions: CompletedSession[], weekIndex?: number): number {
  const keys = new Set<string>();
  for (const session of sessions) {
    if (weekIndex !== undefined && session.weekIndex !== weekIndex) continue;
    keys.add(`${session.weekIndex}-${session.dayIndex}`);
  }
  return keys.size;
}

function currentWeekIndexForPlan(plan: SavedPlan): number {
  const today = new Date();
  const startDate = new Date(plan.plan.meta.start_date);
  return Math.min(
    Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / (7 * 86400000))),
    plan.plan.weeks.length - 1,
  );
}

function weekLabel(week: TrainingWeek): string {
  const tags = [];
  if (week.is_deload) tags.push("Deload");
  tags.push(PHASE_LABELS[week.phase]);
  return tags.join(" · ");
}

// ---------------------------------------------------------------------------
// Activity import panel
// ---------------------------------------------------------------------------

function matchStatusLabel(status: ActivityMatch["status"]): string {
  switch (status) {
    case "auto": return "Ready";
    case "suggestion": return "Review";
    case "duplicate": return "Logged";
    case "unmatched": return "Unmatched";
  }
}

function matchStatusClass(status: ActivityMatch["status"]): string {
  if (status === "auto") return "active-tag";
  if (status === "suggestion") return "warn";
  return "";
}

function ImportedActivityPanel({
  plan,
  onPlanChanged,
}: {
  plan: SavedPlan;
  onPlanChanged: (plan: SavedPlan) => void;
}) {
  const [activities, setActivities] = useState<ImportedActivity[]>([]);
  const [matches, setMatches] = useState<ActivityMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  function refreshMatches(nextPlan: SavedPlan, nextActivities = activities) {
    setMatches(matchImportedActivities(nextPlan.plan, nextActivities, nextPlan.completedSessions));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setMessage(null);
    try {
      const parsed: ImportedActivity[] = [];
      for (const file of Array.from(files)) {
        parsed.push(...parseActivityFile(file.name, await file.text()));
      }
      if (parsed.length === 0) {
        setActivities([]);
        setMatches([]);
        setError("No runnable activities were found in those files.");
        return;
      }
      setActivities(parsed);
      setMatches(matchImportedActivities(plan.plan, parsed, plan.completedSessions));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse activity file.");
    }
  }

  function applySingleImport(match: ActivityMatch): SavedPlan | null {
    if (match.weekIndex === null || match.dayIndex === null) return null;
    const session = plan.plan.weeks[match.weekIndex]?.sessions.find((s) => s.day_index === match.dayIndex);
    if (!session) return null;

    logSession(plan.id, {
      weekIndex: match.weekIndex,
      dayIndex: match.dayIndex,
      date: session.date,
      actualKm: match.activity.distanceKm,
      actualDurationMin: match.activity.durationMin,
      avgHR: match.activity.avgHR,
      maxHR: match.activity.maxHR,
      rpe: null,
      note: `Imported from ${match.activity.fileName}`,
      source: "file_import",
    });

    let refreshed = getPlan(plan.id)!;
    const result = runAdaptations(
      refreshed.plan,
      refreshed.completedSessions,
      refreshed.inputs,
      currentWeekIndexForPlan(refreshed),
    );

    if (result) {
      refreshed = applyAdaptation(plan.id, result.newPlan, {
        rule: result.rule,
        explanation: result.explanation,
        triggeredBySessionIds: result.triggeredBySessionIds,
        firedAt: new Date().toISOString(),
      }).plan;
    }

    return refreshed;
  }

  function importMatches(status: "auto" | "suggestion", selectedMatch?: ActivityMatch) {
    const selected = selectedMatch ? [selectedMatch] : matches.filter((match) => match.status === status);
    if (selected.length === 0) return;
    setImporting(true);
    setMessage(null);
    try {
      let updated: SavedPlan | null = null;
      for (const match of selected) {
        updated = applySingleImport(match) ?? updated;
      }
      if (updated) {
        onPlanChanged(updated);
        refreshMatches(updated);
        setMessage(`${selected.length} activit${selected.length === 1 ? "y" : "ies"} imported.`);
      }
    } finally {
      setImporting(false);
    }
  }

  const autoCount = matches.filter((match) => match.status === "auto").length;

  return (
    <div className="import-panel">
      <div className="import-drop">
        <FileUp size={26} />
        <div>
          <h3>Activity files</h3>
          <p className="muted">GPX and TCX runs from Garmin, Strava, Coros, Suunto, or Apple Health exports.</p>
        </div>
        <label className="button primary import-file-button">
          Choose files
          <input
            className="hidden"
            type="file"
            accept=".gpx,.tcx,application/gpx+xml,application/vnd.garmin.tcx+xml"
            multiple
            onChange={(event) => handleFiles(event.target.files)}
          />
        </label>
      </div>

      {error && <div className="plan-warn">{error}</div>}
      {message && <div className="adapt-banner" style={{ marginBottom: 0 }}>{message}</div>}

      {matches.length > 0 && (
        <>
          <div className="import-toolbar">
            <span className="muted">{matches.length} activit{matches.length === 1 ? "y" : "ies"} parsed</span>
            <button
              className="button primary"
              disabled={autoCount === 0 || importing}
              type="button"
              onClick={() => importMatches("auto")}
            >
              Import ready matches
            </button>
          </div>

          <div className="import-match-list">
            {matches.map((match) => {
              const session = match.weekIndex === null || match.dayIndex === null
                ? null
                : plan.plan.weeks[match.weekIndex]?.sessions.find((s) => s.day_index === match.dayIndex);
              return (
                <div key={match.activity.id} className="import-match-row">
                  <div className="import-match-main">
                    <div className="import-match-title">
                      <strong>{match.activity.name}</strong>
                      <span className={`tag ${matchStatusClass(match.status)}`}>
                        {matchStatusLabel(match.status)}
                      </span>
                    </div>
                    <div className="muted">
                      {match.activity.date} · {match.activity.distanceKm.toFixed(2)} km · {match.activity.durationMin.toFixed(0)} min
                      {match.activity.avgHR ? ` · ${match.activity.avgHR} bpm` : ""}
                    </div>
                    {session && (
                      <div className="import-match-target">
                        Week {match.weekIndex! + 1} · {DAY_ABBRS[session.day_index]} · {SESSION_LABELS[session.type]}
                        {session.target_km ? ` · ${session.target_km.toFixed(1)} km planned` : ""}
                      </div>
                    )}
                    <p>{match.reason}</p>
                  </div>
                  {match.status === "suggestion" && (
                    <button
                      className="button ghost"
                      disabled={importing}
                      type="button"
                      onClick={() => importMatches("suggestion", match)}
                    >
                      Import
                    </button>
                  )}
                  {match.status === "auto" && (
                    <button
                      className="button ghost"
                      disabled={importing}
                      type="button"
                      onClick={() => importMatches("auto", match)}
                    >
                      Import
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar grid (desktop)
// ---------------------------------------------------------------------------

function CalendarGrid({ plan, weekIndex }: { plan: SavedPlan; weekIndex: number }) {
  const week = plan.plan.weeks[weekIndex];
  const id = plan.id;

  return (
    <div className="cal-grid">
      {DAY_ABBRS.map((day, di) => {
        const session = week.sessions.find((s) => s.day_index === di);
        const logged = plan.completedSessions.find(
          (c) => c.weekIndex === weekIndex && c.dayIndex === di,
        );

        if (!session || session.type === "rest") {
          return (
            <div key={di} className="cal-cell rest">
              <span className="cal-day">{day}</span>
              <span className="cal-rest-label">Rest</span>
            </div>
          );
        }
        const color = SESSION_COLORS[session.type] ?? "var(--muted)";
        return (
          <Link
            key={di}
            href={`/app/plans/${id}/sessions/${weekIndex}-${di}`}
            className={`cal-cell active-session${logged ? " logged" : ""}`}
            style={{ "--session-color": color } as React.CSSProperties}
          >
            <span className="cal-day">{day}</span>
            <span className="cal-session-type">{SESSION_LABELS[session.type]}</span>
            <span className="cal-session-dist">{fmtDist(session.target_km)}</span>
            {logged && <span className="cal-logged-dot" />}
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week card
// ---------------------------------------------------------------------------

function WeekCard({
  week,
  weekIndex,
  planId,
  active,
  loggedCount,
  onClick,
}: {
  week: TrainingWeek;
  weekIndex: number;
  planId: string;
  active: boolean;
  loggedCount: number;
  onClick: () => void;
}) {
  const totalSessions = week.sessions.filter((s) => s.type !== "rest").length;
  return (
    <button
      className={`week-card${active ? " active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <div className="week-card-header">
        <div>
          <span className="card-kicker">{weekLabel(week)}</span>
          <div className="week-card-title">
            Week {weekIndex + 1}
            {loggedCount > 0 && (
              <span className="week-progress-badge">
                {loggedCount}/{totalSessions}
              </span>
            )}
          </div>
        </div>
        <div className="week-card-stats">
          <span>{week.total_km.toFixed(0)} km</span>
          <ChevronRight size={14} />
        </div>
      </div>
      <div className="week-session-strip">
        {DAY_ABBRS.map((_, di) => {
          const session = week.sessions.find((s) => s.day_index === di);
          const type = session?.type ?? "rest";
          const color = SESSION_COLORS[type] ?? "var(--line)";
          return (
            <div
              key={di}
              className="week-strip-dot"
              style={{ background: type === "rest" ? "var(--line)" : color }}
              title={type}
            />
          );
        })}
      </div>
      {active && (
        <div className="week-session-list">
          {week.sessions
            .filter((s) => s.type !== "rest")
            .map((s) => (
              <Link
                key={s.day_index}
                href={`/app/plans/${planId}/sessions/${weekIndex}-${s.day_index}`}
                className="week-session-row"
              >
                <span
                  className="week-session-dot"
                  style={{ background: SESSION_COLORS[s.type] ?? "var(--muted)" }}
                />
                <span>
                  <strong>{DAY_ABBRS[s.day_index]}</strong> · {SESSION_LABELS[s.type]}
                  {s.target_km ? ` · ${s.target_km.toFixed(1)} km` : ""}
                </span>
                <ChevronRight size={14} style={{ marginLeft: "auto", flexShrink: 0 }} />
              </Link>
            ))}
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Plan summary header
// ---------------------------------------------------------------------------

function PlanSummary({ plan }: { plan: SavedPlan }) {
  const { meta, paces, weeks } = plan.plan;
  const totalKm = weeks.reduce((s, w) => s + w.total_km, 0);
  const loggedCount = countLoggedSessions(plan.completedSessions);
  return (
    <div className="grid-3" style={{ marginBottom: 18 }}>
      <div className="panel">
        <span className="muted">Goal</span>
        <h2>{GOAL_LABELS[meta.goal_race]}</h2>
        <span className="muted" style={{ fontSize: 13 }}>
          {new Date(meta.goal_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>
      <div className="panel">
        <span className="muted">Plan</span>
        <h2>{meta.weeks_total} wks · {meta.level}</h2>
        <span className="muted" style={{ fontSize: 13 }}>
          {totalKm.toFixed(0)} km total · {loggedCount} session{loggedCount !== 1 ? "s" : ""} logged
        </span>
      </div>
      <div className="panel">
        <span className="muted">Paces</span>
        <h2>{paces.E_low ? formatPace(paces.E_low) : "—"} easy</h2>
        {paces.T && <span className="muted" style={{ fontSize: 13 }}>{formatPace(paces.T)} tempo</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adaptation timeline
// ---------------------------------------------------------------------------

function AdaptationTimeline({
  events,
  onSelect,
}: {
  events: AdaptationEvent[];
  onSelect: (event: AdaptationEvent) => void;
}) {
  if (events.length === 0) {
    return (
      <div className="empty" style={{ minHeight: 140 }}>
        <div>
          <Zap size={28} />
          <p>No adaptations yet. Log sessions and the plan will adjust automatically.</p>
        </div>
      </div>
    );
  }

  const sorted = [...events].sort((a, b) => b.firedAt.localeCompare(a.firedAt));

  return (
    <div className="adapt-timeline">
      {sorted.map((ev) => {
        const color = RULE_COLORS[ev.rule] ?? "var(--muted)";
        return (
          <div key={ev.id} className="adapt-event">
            <div className="adapt-event-dot" style={{ background: color }} />
            <div className="adapt-event-body">
              <div className="adapt-event-header">
                <span className="tag" style={{ borderColor: color, color }}>
                  {RULE_LABELS[ev.rule] ?? ev.rule}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {new Date(ev.firedAt).toLocaleDateString(undefined, {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="adapt-event-text">{ev.explanation}</p>
              <div className="adapt-event-footer">
                <span className="muted" style={{ fontSize: 12 }}>→ Version {ev.newVersionIndex + 1}</span>
                <button className="button ghost compact" type="button" onClick={() => onSelect(ev)}>
                  Details
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Why this changed sheet
// ---------------------------------------------------------------------------

function describePlanDiff(plan: SavedPlan, event: AdaptationEvent): string[] {
  const nextVersion = plan.versions.find((v) => v.versionIndex === event.newVersionIndex);
  const prevVersion = plan.versions.find((v) => v.versionIndex === event.newVersionIndex - 1);
  if (!nextVersion || !prevVersion) return [];

  const changes: string[] = [];
  const prevTotal = prevVersion.plan.weeks.reduce((sum, week) => sum + week.total_km, 0);
  const nextTotal = nextVersion.plan.weeks.reduce((sum, week) => sum + week.total_km, 0);
  const totalDelta = Math.round((nextTotal - prevTotal) * 10) / 10;
  if (totalDelta !== 0) {
    changes.push(`Plan volume ${totalDelta > 0 ? "increased" : "reduced"} by ${Math.abs(totalDelta).toFixed(1)} km.`);
  }

  for (const nextWeek of nextVersion.plan.weeks) {
    const prevWeek = prevVersion.plan.weeks[nextWeek.week_index];
    if (!prevWeek) continue;

    if (prevWeek.total_km !== nextWeek.total_km) {
      changes.push(`Week ${nextWeek.week_index + 1}: ${prevWeek.total_km.toFixed(1)} km → ${nextWeek.total_km.toFixed(1)} km.`);
    }

    for (const nextSession of nextWeek.sessions) {
      const prevSession = prevWeek.sessions.find((s) => s.day_index === nextSession.day_index);
      if (!prevSession) continue;
      const typeChanged = prevSession.type !== nextSession.type;
      const distanceChanged = prevSession.target_km !== nextSession.target_km;
      const paceChanged =
        prevSession.pace_low_s_km !== nextSession.pace_low_s_km ||
        prevSession.pace_high_s_km !== nextSession.pace_high_s_km;

      if (typeChanged) {
        changes.push(
          `Week ${nextWeek.week_index + 1} ${DAY_ABBRS[nextSession.day_index]}: ${SESSION_LABELS[prevSession.type]} → ${SESSION_LABELS[nextSession.type]}.`,
        );
      } else if (distanceChanged) {
        changes.push(
          `Week ${nextWeek.week_index + 1} ${DAY_ABBRS[nextSession.day_index]}: ${fmtDist(prevSession.target_km)} → ${fmtDist(nextSession.target_km)}.`,
        );
      } else if (paceChanged) {
        changes.push(`Week ${nextWeek.week_index + 1} ${DAY_ABBRS[nextSession.day_index]}: target pace updated.`);
      }

      if (changes.length >= 6) return changes;
    }
  }

  return changes;
}

function WhyThisChangedSheet({
  event,
  plan,
  onClose,
}: {
  event: AdaptationEvent;
  plan: SavedPlan;
  onClose: () => void;
}) {
  const triggeredSessions = event.triggeredBySessionIds
    .map((sessionId) => plan.completedSessions.find((s) => s.id === sessionId))
    .filter(Boolean) as CompletedSession[];
  const changes = describePlanDiff(plan, event);

  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <section
        className="why-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Why this changed"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="why-sheet-header">
          <div>
            <span className="card-kicker">Why this changed</span>
            <h2>{RULE_LABELS[event.rule] ?? event.rule}</h2>
          </div>
          <button className="button ghost icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="why-sheet-section">
          <span className="field-label">Reason</span>
          <p>{event.explanation}</p>
        </div>

        <div className="why-sheet-grid">
          <div className="why-stat">
            <span className="muted">Rule</span>
            <strong>{RULE_LABELS[event.rule] ?? event.rule}</strong>
          </div>
          <div className="why-stat">
            <span className="muted">Created</span>
            <strong>
              {new Date(event.firedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </strong>
          </div>
          <div className="why-stat">
            <span className="muted">Version</span>
            <strong>{event.newVersionIndex + 1}</strong>
          </div>
        </div>

        {triggeredSessions.length > 0 && (
          <div className="why-sheet-section">
            <span className="field-label">Triggered by</span>
            <div className="why-list">
              {triggeredSessions.map((session) => (
                <div key={session.id} className="why-list-row">
                  <strong>Week {session.weekIndex + 1} · {DAY_ABBRS[session.dayIndex]}</strong>
                  <span className="muted">
                    {session.actualKm ? `${session.actualKm.toFixed(1)} km` : "No distance"}
                    {session.avgHR ? ` · ${session.avgHR} bpm` : ""}
                    {session.rpe ? ` · RPE ${session.rpe}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="why-sheet-section">
          <span className="field-label">Changed in the plan</span>
          {changes.length > 0 ? (
            <div className="why-list">
              {changes.map((change, index) => (
                <div key={index} className="why-list-row">
                  <span>{change}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">The rule updated plan metadata or paces without changing visible sessions.</p>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Version history
// ---------------------------------------------------------------------------

function VersionHistory({ versions }: { versions: PlanVersion[] }) {
  const sorted = [...versions].sort((a, b) => b.versionIndex - a.versionIndex);
  return (
    <div className="version-list">
      {sorted.map((v) => (
        <div key={v.versionIndex} className="version-row">
          <div className="version-row-left">
            <GitBranch size={14} style={{ color: "var(--muted)" }} />
            <div>
              <strong>Version {v.versionIndex + 1}</strong>
              <div className="muted" style={{ fontSize: 12 }}>
                {v.adaptationRule ? RULE_LABELS[v.adaptationRule] ?? v.adaptationRule : "Initial plan"} ·{" "}
                {new Date(v.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </div>
            </div>
          </div>
          <span className="tag">{v.reason}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = "plan" | "import" | "adaptations" | "history";

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [weekIndex, setWeekIndex] = useState(0);
  const [tab, setTab] = useState<Tab>("plan");
  const [selectedEvent, setSelectedEvent] = useState<AdaptationEvent | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const p = getPlan(id);
    if (!p) { setLoaded(true); return; }
    setWeekIndex(currentWeekIndexForPlan(p));
    setPlan(p);
    setLoaded(true);
  }, [id]);

  if (!loaded) return null;
  if (!plan) notFound();

  const week = plan.plan.weeks[weekIndex];

  function loggedCountForWeek(wi: number): number {
    return countLoggedSessions(plan!.completedSessions, wi);
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          <Link className="button ghost" href="/app/plans" style={{ marginBottom: 6, display: "inline-flex" }}>
            <ArrowLeft size={16} />
            Plans
          </Link>
          <h1>{GOAL_LABELS[plan.plan.meta.goal_race]} plan</h1>
          <p>
            Week {weekIndex + 1} of {plan.plan.weeks.length} · {PHASE_LABELS[week.phase]}
            {week.is_deload ? " · Deload" : ""}
          </p>
        </div>
      </div>

      <PlanSummary plan={plan} />

      {/* Tab bar */}
      <div className="plan-tabs" style={{ marginBottom: 18 }}>
        <button
          className={`plan-tab${tab === "plan" ? " active" : ""}`}
          onClick={() => setTab("plan")}
          type="button"
        >
          <LayoutGrid size={15} />
          Calendar
        </button>
        <button
          className={`plan-tab${tab === "adaptations" ? " active" : ""}`}
          onClick={() => setTab("adaptations")}
          type="button"
        >
          <Zap size={15} />
          Adaptations
          {plan.adaptationEvents.length > 0 && (
            <span className="plan-tab-badge">{plan.adaptationEvents.length}</span>
          )}
        </button>
        <button
          className={`plan-tab${tab === "import" ? " active" : ""}`}
          onClick={() => setTab("import")}
          type="button"
        >
          <FileUp size={15} />
          Import
        </button>
        <button
          className={`plan-tab${tab === "history" ? " active" : ""}`}
          onClick={() => setTab("history")}
          type="button"
        >
          <History size={15} />
          History
        </button>
      </div>

      {tab === "plan" && (
        <>
          {/* Desktop layout */}
          <div className="plan-detail-layout">
            <aside className="plan-week-sidebar">
              <div className="plan-week-sidebar-inner">
                {plan.plan.weeks.map((w, i) => (
                  <WeekCard
                    key={i}
                    week={w}
                    weekIndex={i}
                    planId={plan.id}
                    active={i === weekIndex}
                    loggedCount={loggedCountForWeek(i)}
                    onClick={() => setWeekIndex(i)}
                  />
                ))}
              </div>
            </aside>

            <section className="plan-cal-section">
              <div className="plan-cal-header">
                <div>
                  <span className="card-kicker">{weekLabel(week)}</span>
                  <h3>Week {weekIndex + 1} — {week.total_km.toFixed(0)} km</h3>
                </div>
                <div className="button-row">
                  <button
                    className="button ghost"
                    disabled={weekIndex === 0}
                    onClick={() => setWeekIndex((w) => w - 1)}
                  >‹</button>
                  <button
                    className="button ghost"
                    disabled={weekIndex === plan.plan.weeks.length - 1}
                    onClick={() => setWeekIndex((w) => w + 1)}
                  >›</button>
                </div>
              </div>
              <CalendarGrid plan={plan} weekIndex={weekIndex} />
              {plan.plan.warnings.length > 0 && (
                <div className="plan-warnings panel" style={{ marginTop: 16 }}>
                  {plan.plan.warnings.map((w, i) => (
                    <div key={i} className="plan-warn">
                      <Target size={14} />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Mobile week list */}
          <div className="plan-week-mobile">
            {plan.plan.weeks.map((w, i) => (
              <WeekCard
                key={i}
                week={w}
                weekIndex={i}
                planId={plan.id}
                active={i === weekIndex}
                loggedCount={loggedCountForWeek(i)}
                onClick={() => setWeekIndex(i === weekIndex ? -1 : i)}
              />
            ))}
          </div>
        </>
      )}

      {tab === "adaptations" && (
        <div className="panel">
          <h2>Adaptation history</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            Every time the plan adjusts based on your logged sessions, the reason is recorded here.
          </p>
          <AdaptationTimeline events={plan.adaptationEvents} onSelect={setSelectedEvent} />
        </div>
      )}

      {tab === "import" && (
        <div className="panel">
          <h2>Activity import</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            Same-date matches can be logged directly. Date mismatches stay as review suggestions.
          </p>
          <ImportedActivityPanel plan={plan} onPlanChanged={setPlan} />
        </div>
      )}

      {tab === "history" && (
        <div className="panel">
          <h2>Version history</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            Each adaptation creates a new version. Prior weeks are never modified.
          </p>
          <VersionHistory versions={plan.versions} />
        </div>
      )}

      {selectedEvent && (
        <WhyThisChangedSheet
          event={selectedEvent}
          plan={plan}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  );
}
