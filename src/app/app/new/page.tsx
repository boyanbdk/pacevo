"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { WORKOUT_RECIPES } from "@/domain/training-plan/workout-recipes";
import { pacesFromVdot } from "@/domain/training-plan/vdot";
import type { Level, PlannedSession, RecipeSessionType, WorkoutContext } from "@/domain/training-plan/types";
import type { AdjustedStep, AdjustedWorkout, SavedWorkout, TailoringInputs, WorkoutAdjustment } from "@/domain/workout-schema";
import { saveWorkout } from "@/lib/storage";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_OPTIONS: { value: RecipeSessionType; label: string; sub: string }[] = [
  { value: "recovery", label: "Recovery", sub: "Light effort, short" },
  { value: "easy", label: "Easy run", sub: "Aerobic base building" },
  { value: "long", label: "Long run", sub: "Endurance and durability" },
  { value: "tempo", label: "Tempo", sub: "Lactate threshold work" },
  { value: "interval", label: "Intervals", sub: "Speed and VO2max" },
];

const DURATION_OPTIONS = [20, 30, 45, 60, 75, 90];

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

// Rough min/km pace (warmup + main + cooldown averaged) per session type.
// Used to convert duration to a targetKm for recipe context.
const DURATION_PACE_MIN_PER_KM: Record<RecipeSessionType, number> = {
  recovery: 7.0,
  easy: 6.2,
  long: 6.5,
  tempo: 5.2,
  interval: 5.8,
};

// Representative weekly km by level — used for recipe minWeeklyKm filtering.
const WEEKLY_KM_BY_LEVEL: Record<Level, number> = {
  beginner: 25,
  intermediate: 48,
  advanced: 72,
};

// Default VDOT for pace derivation when no user performance data is available.
// VDOT 45 ≈ 23-minute 5K — a moderate recreational runner.
const DEFAULT_VDOT = 45;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function durationToKm(type: RecipeSessionType, minutes: number): number {
  return Math.round((minutes / DURATION_PACE_MIN_PER_KM[type]) * 10) / 10;
}

function buildCandidates(
  sessionType: RecipeSessionType,
  durationMin: number,
  level: Level
): PlannedSession[] {
  const weeklyKm = WEEKLY_KM_BY_LEVEL[level];
  const targetKm = durationToKm(sessionType, durationMin);
  const paces = pacesFromVdot(DEFAULT_VDOT);
  const today = new Date();

  const ctx: WorkoutContext = {
    dayIndex: 2,
    date: today,
    targetKm,
    paces,
    level,
    phase: "build",
    goalRace: "10K",
    weeklyKm,
    weekIndex: 4,
  };

  return WORKOUT_RECIPES
    .filter(r =>
      r.sessionType === sessionType &&
      r.levels.includes(level) &&
      r.minWeeklyKm <= weeklyKm
    )
    .map(r => r.build(ctx));
}

function sessionToAdjustedWorkout(session: PlannedSession): AdjustedWorkout {
  const steps: AdjustedStep[] = [];

  if (session.warmup) {
    steps.push({
      id: "warmup",
      kind: "Warm-up",
      label: "Easy effort",
      target: session.warmup,
      detail: "",
    });
  }
  if (session.main_set) {
    steps.push({
      id: "main",
      kind: "Main set",
      label: session.type,
      target: session.main_set,
      detail: session.description,
    });
  }
  if (session.cooldown) {
    steps.push({
      id: "cooldown",
      kind: "Cool-down",
      label: "Easy effort",
      target: session.cooldown,
      detail: "",
    });
  }
  if (steps.length === 0) {
    steps.push({
      id: "main",
      kind: "Run",
      label: session.type,
      target: session.description,
      detail: session.rationale,
    });
  }

  const stubInputs: TailoringInputs = {
    runContext: "free-run",
    outputFormat: "general",
    easyPace: "6:00",
    cooldownPace: "6:30",
    feeling: 7,
    push: "normal",
  };

  const notes: string[] = [];
  if (session.target_km) notes.push(`${session.target_km.toFixed(1)} km`);
  if (session.target_duration_min) notes.push(`~${session.target_duration_min} min`);

  return {
    title: session.description,
    lane: session.type,
    inputs: stubInputs,
    summary: session.rationale,
    steps,
    notes,
    generatedAt: new Date().toISOString(),
  };
}

function saveRecipeSession(session: PlannedSession): string {
  const now = new Date().toISOString();
  const adjusted = sessionToAdjustedWorkout(session);
  const adjustment: WorkoutAdjustment = {
    id: crypto.randomUUID(),
    inputs: adjusted.inputs,
    adjustedWorkout: adjusted,
    displayStyle: "steps",
    revisionNumber: 1,
    createdAt: now,
  };
  const workout: SavedWorkout = {
    id: crypto.randomUUID(),
    title: session.description,
    sourceType: "text",
    sourceText: [session.warmup, session.main_set, session.cooldown].filter(Boolean).join("\n"),
    parsedWorkout: {
      title: session.description,
      activityType: "running",
      sourceSummary: session.rationale,
      steps: [],
      uncertaintyFlags: [],
    },
    adjustments: [adjustment],
    createdAt: now,
    updatedAt: now,
  };
  saveWorkout(workout);
  return workout.id;
}

// ---------------------------------------------------------------------------
// Candidate card
// ---------------------------------------------------------------------------

function CandidateCard({
  session,
  onSave,
}: {
  session: PlannedSession;
  onSave: () => void;
}) {
  return (
    <div className="panel stack" style={{ gap: 12 }}>
      <div>
        <div className="card-kicker">{session.type}</div>
        <h3 style={{ margin: "4px 0 6px" }}>{session.description}</h3>
        <p className="muted" style={{ fontSize: 14 }}>{session.rationale}</p>
      </div>
      {(session.warmup || session.main_set || session.cooldown) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {session.warmup && (
            <div className="recipe-step-row">
              <span className="recipe-step-label">Warm-up</span>
              <span>{session.warmup}</span>
            </div>
          )}
          {session.main_set && (
            <div className="recipe-step-row">
              <span className="recipe-step-label">Main set</span>
              <span>{session.main_set}</span>
            </div>
          )}
          {session.cooldown && (
            <div className="recipe-step-row">
              <span className="recipe-step-label">Cool-down</span>
              <span>{session.cooldown}</span>
            </div>
          )}
        </div>
      )}
      <div className="tag-row" style={{ marginTop: 4 }}>
        {session.target_km && <span className="tag">{session.target_km.toFixed(1)} km</span>}
        {session.target_duration_min && <span className="tag">~{session.target_duration_min} min</span>}
        {session.hr_zone && <span className="tag">{session.hr_zone}</span>}
      </div>
      <button className="button primary" type="button" onClick={onSave} style={{ alignSelf: "flex-start" }}>
        <Save size={16} />
        Save workout
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type FormState = {
  sessionType: RecipeSessionType | null;
  durationMin: number;
  level: Level;
};

export default function NewWorkoutPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    sessionType: null,
    durationMin: 45,
    level: "intermediate",
  });
  const [candidates, setCandidates] = useState<PlannedSession[] | null>(null);

  function find() {
    if (!form.sessionType) return;
    setCandidates(buildCandidates(form.sessionType, form.durationMin, form.level));
  }

  function handleSave(session: PlannedSession) {
    const id = saveRecipeSession(session);
    router.push(`/app/workouts/${id}`);
  }

  const ready = !!form.sessionType;

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          <h1>New workout</h1>
          <p>Choose a workout type and duration to see matching options for today.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <section className="panel stack">
            <div>
              <p className="field-label">Workout type</p>
              <div className="plan-goal-grid">
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`plan-goal-btn${form.sessionType === opt.value ? " selected" : ""}`}
                    onClick={() => { setForm(f => ({ ...f, sessionType: opt.value })); setCandidates(null); }}
                  >
                    <strong>{opt.label}</strong>
                    <span>{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <p className="field-label">Duration</p>
              <div className="segmented" style={{ gridTemplateColumns: `repeat(${DURATION_OPTIONS.length}, 1fr)` }}>
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={form.durationMin === d ? "selected" : ""}
                    onClick={() => { setForm(f => ({ ...f, durationMin: d })); setCandidates(null); }}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <p className="field-label">Your level</p>
              <div className="segmented" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                {LEVEL_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={form.level === value ? "selected" : ""}
                    onClick={() => { setForm(f => ({ ...f, level: value })); setCandidates(null); }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="button primary"
              type="button"
              disabled={!ready}
              onClick={find}
            >
              Find workouts
            </button>
          </section>
        </div>

        <div className="stack">
          {candidates === null && (
            <div className="panel empty">
              <p>Choose a type and duration, then tap Find workouts to see options.</p>
            </div>
          )}
          {candidates !== null && candidates.length === 0 && (
            <div className="panel empty">
              <p>No matching workouts for this combination. Try a different type or level.</p>
            </div>
          )}
          {candidates !== null && candidates.map((session, i) => (
            <CandidateCard
              key={`${session.recipe_id ?? session.type}-${i}`}
              session={session}
              onSave={() => handleSave(session)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
