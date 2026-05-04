"use client";

import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buildPlan } from "@/domain/training-plan/build-plan";
import type { DifficultyPref, GoalRace, IntensityMode, Level, PlanInputs, Surface, TrainingFocus, VolumePref } from "@/domain/training-plan/types";
import { createPlan, savePlan } from "@/lib/plan-storage";
import { getSettings } from "@/lib/storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormState = {
  // Step 1: Goal
  goalRace: GoalRace | "";
  goalDate: string;
  // Step 2: Current training
  weeklyKm: string;
  longestRecentKm: string;
  // Step 3: Recent performance
  performanceMode: "race" | "estimate" | "none";
  raceDistance: string;
  raceTimeH: string;
  raceTimeM: string;
  raceTimeS: string;
  estimateDistance: string; // estimate distance — independent from goal race
  estimateTimeH: string;
  estimateTimeM: string;
  estimateTimeS: string;
  // Step 4: Preferences
  selfSelectedLevel: Level | "";
  trainingFocus: TrainingFocus;
  volumePref: VolumePref;
  difficultyPref: DifficultyPref;
  intensityMode: IntensityMode;
  // Step 5: Constraints
  daysPerWeek: string;
  sessionMinutesCap: string;
  longRunDay: string;
  surface: Surface;
  // Step 6: Health
  age: string;
  restingHR: string;
  maxHR: string;
  injuryFlags: string;
};

const INITIAL: FormState = {
  goalRace: "",
  goalDate: "",
  weeklyKm: "",
  longestRecentKm: "",
  performanceMode: "none",
  raceDistance: "",
  raceTimeH: "",
  raceTimeM: "",
  raceTimeS: "",
  estimateDistance: "",
  estimateTimeH: "",
  estimateTimeM: "",
  estimateTimeS: "",
  selfSelectedLevel: "",
  trainingFocus: "balanced",
  volumePref: "steady",
  difficultyPref: "balanced",
  intensityMode: "hr",
  daysPerWeek: "4",
  sessionMinutesCap: "",
  longRunDay: "saturday",
  surface: "road",
  age: "",
  restingHR: "",
  maxHR: "",
  injuryFlags: "",
};

function initialFormState(): FormState {
  return {
    ...INITIAL,
    intensityMode: getSettings().intensityMode,
  };
}

const GOAL_OPTIONS: { value: GoalRace; label: string; sub: string }[] = [
  { value: "5K", label: "5K", sub: "5 kilometres" },
  { value: "10K", label: "10K", sub: "10 kilometres" },
  { value: "half", label: "Half marathon", sub: "21.1 km" },
  { value: "marathon", label: "Marathon", sub: "42.2 km" },
];

// Minimum plan lengths per goal (weeks) – used to block impossible dates
const MIN_WEEKS: Record<GoalRace, number> = {
  "5K": 6, "10K": 8, half: 10, marathon: 12,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hmsToSeconds(h: string, m: string, s: string): number | null {
  const hv = parseInt(h || "0", 10);
  const mv = parseInt(m || "0", 10);
  const sv = parseInt(s || "0", 10);
  if (isNaN(hv) || isNaN(mv) || isNaN(sv)) return null;
  if (mv >= 60 || sv >= 60) return null;
  const total = hv * 3600 + mv * 60 + sv;
  return total > 0 ? total : null;
}

function weeksUntil(dateStr: string): number {
  const goal = new Date(dateStr);
  const today = new Date();
  return Math.floor((goal.getTime() - today.getTime()) / (7 * 86400000));
}

function infeasibleReason(state: FormState): string | null {
  if (!state.goalRace || !state.goalDate) return null;
  const weeks = weeksUntil(state.goalDate);
  const min = MIN_WEEKS[state.goalRace as GoalRace];
  if (weeks < 0) return "The goal date is in the past.";
  if (weeks < min) {
    return `A ${state.goalRace} plan needs at least ${min} weeks. Your date gives ${weeks} week${weeks === 1 ? "" : "s"}. Try a later date or a shorter goal.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function Step1({ s, set }: { s: FormState; set: (p: Partial<FormState>) => void }) {
  const reason = infeasibleReason(s);
  return (
    <div className="stack">
      <div>
        <p className="field-label">Goal race</p>
        <div className="plan-goal-grid">
          {GOAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`plan-goal-btn${s.goalRace === opt.value ? " selected" : ""}`}
              onClick={() => set({ goalRace: opt.value })}
            >
              <strong>{opt.label}</strong>
              <span>{opt.sub}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="field-label">Goal date</label>
        <input
          type="date"
          className="input"
          value={s.goalDate}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => set({ goalDate: e.target.value })}
        />
      </div>
      {reason && (
        <div className="plan-warn">
          <AlertCircle size={16} />
          <span>{reason}</span>
        </div>
      )}
    </div>
  );
}

function Step2({ s, set }: { s: FormState; set: (p: Partial<FormState>) => void }) {
  return (
    <div className="stack">
      <div className="field">
        <label className="field-label">Average weekly kilometres (last 4 weeks)</label>
        <input
          type="number"
          className="input"
          placeholder="e.g. 30"
          min="0"
          max="300"
          value={s.weeklyKm}
          onChange={(e) => set({ weeklyKm: e.target.value })}
        />
        <span className="field-hint">Be honest — this sets your starting volume.</span>
      </div>
      <div className="field">
        <label className="field-label">Longest run in the last 4 weeks (km)</label>
        <input
          type="number"
          className="input"
          placeholder="e.g. 16"
          min="0"
          max="100"
          value={s.longestRecentKm}
          onChange={(e) => set({ longestRecentKm: e.target.value })}
        />
      </div>
    </div>
  );
}

function TimeInputs({
  label,
  h, m, s,
  onH, onM, onS,
  hint,
}: {
  label: string;
  h: string; m: string; s: string;
  onH: (v: string) => void;
  onM: (v: string) => void;
  onS: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <div className="hms-row">
        <div className="hms-field">
          <input
            type="number"
            className="input"
            placeholder="0"
            min="0"
            max="23"
            value={h}
            onChange={(e) => onH(e.target.value)}
            aria-label="hours"
          />
          <span className="hms-label">h</span>
        </div>
        <div className="hms-field">
          <input
            type="number"
            className="input"
            placeholder="00"
            min="0"
            max="59"
            value={m}
            onChange={(e) => onM(e.target.value)}
            aria-label="minutes"
          />
          <span className="hms-label">m</span>
        </div>
        <div className="hms-field">
          <input
            type="number"
            className="input"
            placeholder="00"
            min="0"
            max="59"
            value={s}
            onChange={(e) => onS(e.target.value)}
            aria-label="seconds"
          />
          <span className="hms-label">s</span>
        </div>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

const ESTIMATE_DISTANCES = [
  { value: "5000", label: "5K" },
  { value: "10000", label: "10K" },
  { value: "21097", label: "Half marathon" },
  { value: "42195", label: "Marathon" },
];

function Step3({ s, set }: { s: FormState; set: (p: Partial<FormState>) => void }) {
  return (
    <div className="stack">
      <div>
        <p className="field-label">Performance data</p>
        <div className="plan-perf-grid">
          <button
            type="button"
            className={`plan-perf-btn${s.performanceMode === "race" ? " selected" : ""}`}
            onClick={() => set({ performanceMode: "race" })}
          >
            <strong>I have a recent time</strong>
            <span>Race or time-trial in the last 90 days</span>
          </button>
          <button
            type="button"
            className={`plan-perf-btn${s.performanceMode === "estimate" ? " selected" : ""}`}
            onClick={() => set({ performanceMode: "estimate" })}
          >
            <strong>I can estimate</strong>
            <span>Rough idea of what I could run today</span>
          </button>
          <button
            type="button"
            className={`plan-perf-btn${s.performanceMode === "none" ? " selected" : ""}`}
            onClick={() => set({ performanceMode: "none" })}
          >
            <strong>I don&apos;t know</strong>
            <span>We&apos;ll estimate from training volume</span>
          </button>
        </div>
      </div>
      {s.performanceMode === "race" && (
        <>
          <div className="field">
            <label className="field-label">Distance</label>
            <select
              className="select input"
              value={s.raceDistance}
              onChange={(e) => set({ raceDistance: e.target.value })}
            >
              <option value="">Select distance</option>
              <option value="5000">5K</option>
              <option value="10000">10K</option>
              <option value="21097">Half marathon</option>
              <option value="42195">Marathon</option>
              <option value="1609">1 mile</option>
              <option value="3000">3K</option>
            </select>
          </div>
          <TimeInputs
            label="Finish time"
            h={s.raceTimeH} m={s.raceTimeM} s={s.raceTimeS}
            onH={(v) => set({ raceTimeH: v })}
            onM={(v) => set({ raceTimeM: v })}
            onS={(v) => set({ raceTimeS: v })}
            hint="Your actual finish time from the race or time-trial."
          />
        </>
      )}
      {s.performanceMode === "estimate" && (
        <>
          <div className="field">
            <label className="field-label">Estimate distance</label>
            <div className="segmented" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              {ESTIMATE_DISTANCES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={s.estimateDistance === value ? "selected" : ""}
                  onClick={() => set({ estimateDistance: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="field-hint">
              Pick any distance — we&apos;ll convert to your goal pace using Riegel.
            </span>
          </div>
          <TimeInputs
            label="Estimated finish time — if you raced today"
            h={s.estimateTimeH} m={s.estimateTimeM} s={s.estimateTimeS}
            onH={(v) => set({ estimateTimeH: v })}
            onM={(v) => set({ estimateTimeM: v })}
            onS={(v) => set({ estimateTimeS: v })}
            hint="A rough estimate is fine. Used to set your training paces."
          />
        </>
      )}
    </div>
  );
}

function Step4Preferences({ s, set }: { s: FormState; set: (p: Partial<FormState>) => void }) {
  return (
    <div className="stack">
      <div className="field">
        <p className="field-label">Experience level</p>
        <div className="segmented" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {(["beginner", "intermediate", "advanced"] as Level[]).map((l) => (
            <button
              key={l}
              type="button"
              className={s.selfSelectedLevel === l ? "selected" : ""}
              onClick={() => set({ selfSelectedLevel: l })}
            >
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
        <span className="field-hint">
          We&apos;ll verify this against your training data and use the safer estimate.
        </span>
      </div>
      <div className="field">
        <p className="field-label">Training focus</p>
        <div className="segmented" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {([
            ["balanced", "Balanced"],
            ["speed", "Speed"],
            ["endurance", "Endurance"],
          ] as [TrainingFocus, string][]).map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={s.trainingFocus === val ? "selected" : ""}
              onClick={() => set({ trainingFocus: val })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <p className="field-label">Volume build</p>
        <div className="segmented" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {([
            ["gradual", "Gradual"],
            ["steady", "Steady"],
            ["progressive", "Progressive"],
          ] as [VolumePref, string][]).map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={s.volumePref === val ? "selected" : ""}
              onClick={() => set({ volumePref: val })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <p className="field-label">Difficulty</p>
        <div className="segmented" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {([
            ["comfortable", "Comfortable"],
            ["balanced", "Balanced"],
            ["challenging", "Challenging"],
          ] as [DifficultyPref, string][]).map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={s.difficultyPref === val ? "selected" : ""}
              onClick={() => set({ difficultyPref: val })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <p className="field-label">Workout intensity display</p>
        <div className="segmented" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {([
            ["pace", "Pace"],
            ["rpe", "RPE"],
            ["hr", "Heart rate"],
          ] as [IntensityMode, string][]).map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={s.intensityMode === val ? "selected" : ""}
              onClick={() => set({ intensityMode: val })}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="field-hint">You can change this in settings later.</span>
      </div>
    </div>
  );
}

function Step5Schedule({ s, set }: { s: FormState; set: (p: Partial<FormState>) => void }) {
  const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  return (
    <div className="stack">
      <div className="field">
        <label className="field-label">Training days per week</label>
        <div className="segmented" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
          {[3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              type="button"
              className={s.daysPerWeek === String(n) ? "selected" : ""}
              onClick={() => set({ daysPerWeek: String(n) })}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="field-label">Max session length (optional)</label>
        <input
          type="number"
          className="input"
          placeholder="e.g. 90 (minutes)"
          min="20"
          max="300"
          value={s.sessionMinutesCap}
          onChange={(e) => set({ sessionMinutesCap: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="field-label">Preferred long-run day</label>
        <select
          className="select input"
          value={s.longRunDay}
          onChange={(e) => set({ longRunDay: e.target.value })}
        >
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label">Primary surface</label>
        <div className="segmented" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {(["road", "treadmill", "mixed"] as Surface[]).map((s2) => (
            <button
              key={s2}
              type="button"
              className={s.surface === s2 ? "selected" : ""}
              onClick={() => set({ surface: s2 })}
            >
              {s2.charAt(0).toUpperCase() + s2.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Step6Health({ s, set }: { s: FormState; set: (p: Partial<FormState>) => void }) {
  return (
    <div className="stack">
      <div className="field">
        <label className="field-label">Age</label>
        <input
          type="number"
          className="input"
          placeholder="e.g. 32"
          min="16"
          max="99"
          value={s.age}
          onChange={(e) => set({ age: e.target.value })}
        />
      </div>
      <div className="grid-2-equal">
        <div className="field">
          <label className="field-label">Resting HR (optional)</label>
          <input
            type="number"
            className="input"
            placeholder="bpm"
            min="30"
            max="120"
            value={s.restingHR}
            onChange={(e) => set({ restingHR: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label">Max HR (optional)</label>
          <input
            type="number"
            className="input"
            placeholder="bpm — we&apos;ll estimate if blank"
            min="100"
            max="230"
            value={s.maxHR}
            onChange={(e) => set({ maxHR: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label className="field-label">Injury or return-to-run flags (optional)</label>
        <input
          type="text"
          className="input"
          placeholder="e.g. shin splints, post-knee surgery"
          value={s.injuryFlags}
          onChange={(e) => set({ injuryFlags: e.target.value })}
        />
        <span className="field-hint">
          We&apos;ll insert rest or cross-training where relevant. This does not replace medical advice.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step config
// ---------------------------------------------------------------------------

const STEPS = [
  { label: "Goal", description: "Race and date" },
  { label: "Training", description: "Current fitness" },
  { label: "Performance", description: "Recent time or estimate" },
  { label: "Preferences", description: "Level and training style" },
  { label: "Schedule", description: "Days and surface" },
  { label: "Health", description: "Age and HR" },
];

// ---------------------------------------------------------------------------
// Validation per step
// ---------------------------------------------------------------------------

function canProceed(step: number, s: FormState): boolean {
  if (step === 0) return !!s.goalRace && !!s.goalDate && !infeasibleReason(s);
  if (step === 1) return !!s.weeklyKm && !!s.longestRecentKm;
  if (step === 2) {
    if (s.performanceMode === "none") return true;
    if (s.performanceMode === "estimate") {
      return !!s.estimateDistance && hmsToSeconds(s.estimateTimeH, s.estimateTimeM, s.estimateTimeS) !== null;
    }
    return !!s.raceDistance && hmsToSeconds(s.raceTimeH, s.raceTimeM, s.raceTimeS) !== null;
  }
  if (step === 3) return true; // preferences all have defaults
  if (step === 4) return !!s.daysPerWeek;
  if (step === 5) return !!s.age;
  return true;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function NewPlanPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  function patch(partial: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function buildInputs(): PlanInputs {
    const raceTimeS = hmsToSeconds(form.raceTimeH, form.raceTimeM, form.raceTimeS);
    const recentRace =
      form.performanceMode === "race" && form.raceDistance && raceTimeS !== null
        ? { distance_m: Number(form.raceDistance), time_s: raceTimeS }
        : null;

    const estimateTimeS = hmsToSeconds(form.estimateTimeH, form.estimateTimeM, form.estimateTimeS);
    const estimatedRaceTimeS =
      form.performanceMode === "estimate" && form.estimateDistance && estimateTimeS !== null
        ? estimateTimeS
        : null;
    const estimatedRaceDistanceM =
      form.performanceMode === "estimate" && form.estimateDistance
        ? Number(form.estimateDistance)
        : null;

    return {
      goal_race: form.goalRace as GoalRace,
      goal_date: form.goalDate,
      current_weekly_km: Number(form.weeklyKm),
      longest_recent_km: Number(form.longestRecentKm),
      recent_race: recentRace,
      estimated_race_time_s: estimatedRaceTimeS,
      estimated_race_distance_m: estimatedRaceDistanceM,
      age: Number(form.age),
      resting_hr: form.restingHR ? Number(form.restingHR) : null,
      max_hr: form.maxHR ? Number(form.maxHR) : null,
      days_per_week: Number(form.daysPerWeek),
      session_minutes_cap: form.sessionMinutesCap ? Number(form.sessionMinutesCap) : null,
      long_run_day: form.longRunDay,
      surface: form.surface,
      injury_flags: form.injuryFlags
        ? form.injuryFlags.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      self_selected_level: form.selfSelectedLevel || null,
      training_focus: form.trainingFocus,
      volume_preference: form.volumePref,
      difficulty_preference: form.difficultyPref,
      intensity_mode: form.intensityMode,
    };
  }

  function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const inputs = buildInputs();
      const plan = buildPlan(inputs);
      const saved = createPlan(inputs, plan);
      savePlan(saved);
      router.push(`/app/plans/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plan.");
      setGenerating(false);
    }
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div className="plan-onboard-shell">
      {/* Progress header */}
      <div className="plan-onboard-header">
        <button
          className="button ghost plan-onboard-back"
          onClick={() => (step === 0 ? router.push("/app/plans") : setStep((s) => s - 1))}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="plan-step-dots">
          {STEPS.map((st, i) => (
            <div key={i} className={`plan-step-dot${i === step ? " active" : i < step ? " done" : ""}`} />
          ))}
        </div>
        <span className="muted" style={{ fontSize: 13 }}>
          {step + 1} / {STEPS.length}
        </span>
      </div>

      <div className="plan-onboard-card panel">
        <div className="plan-onboard-step-label">
          <span className="card-kicker">{STEPS[step].description}</span>
          <h2>{STEPS[step].label}</h2>
        </div>

        {step === 0 && <Step1 s={form} set={patch} />}
        {step === 1 && <Step2 s={form} set={patch} />}
        {step === 2 && <Step3 s={form} set={patch} />}
        {step === 3 && <Step4Preferences s={form} set={patch} />}
        {step === 4 && <Step5Schedule s={form} set={patch} />}
        {step === 5 && <Step6Health s={form} set={patch} />}

        {error && (
          <div className="plan-warn" style={{ marginTop: 16 }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="button-row" style={{ marginTop: 24 }}>
          {isLast ? (
            <button
              className="button primary"
              disabled={!canProceed(step, form) || generating}
              onClick={handleGenerate}
            >
              <CheckCircle size={16} />
              {generating ? "Generating…" : "Build my plan"}
            </button>
          ) : (
            <button
              className="button primary"
              disabled={!canProceed(step, form)}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
