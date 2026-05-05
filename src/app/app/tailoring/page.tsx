"use client";

import { CalendarDays, Save, Sparkles, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdjustedWorkoutCard } from "@/components/AdjustedWorkoutCard";
import { ExportMenu } from "@/components/ExportMenu";
import { parseWorkoutText } from "@/domain/parser";
import { plannedSessionToParsedWorkout, plannedSessionToWorkoutText } from "@/domain/planned-session-tailoring";
import { tailorWorkout } from "@/domain/run-tailor";
import type { PlannedSession } from "@/domain/training-plan/types";
import type { AdjustedWorkout, DisplayStyle, ParsedWorkout, PlannedSessionLink, SavedWorkout, TailoringInputs, WorkoutAdjustment } from "@/domain/workout-schema";
import { DEMO_WORKOUTS } from "@/lib/demo-workouts";
import { BRAND_NAME } from "@/lib/brand";
import { formatWeekdayDate, parsePlanDate } from "@/lib/plan-dates";
import type { SavedPlan } from "@/lib/plan-storage";
import { getPlans } from "@/lib/plan-storage";
import { getSettings, getWorkoutForPlannedSession, saveSettings, saveWorkout } from "@/lib/storage";

type PlannedSessionOption = {
  plan: SavedPlan;
  session: PlannedSession;
  sessionId: string;
  weekIndex: number;
  dayIndex: number;
  date: Date;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function upcomingPlannedSessions(): PlannedSessionOption[] {
  const today = startOfDay(new Date());
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const options: PlannedSessionOption[] = [];

  for (const plan of getPlans().filter((candidate) => candidate.status === "active")) {
    plan.plan.weeks.forEach((week, weekIndex) => {
      week.sessions.forEach((session) => {
        if (session.type === "rest") return;
        const date = startOfDay(parsePlanDate(session.date));
        if (date < today || date > end) return;
        options.push({
          plan,
          session,
          sessionId: `${weekIndex}-${session.day_index}`,
          weekIndex,
          dayIndex: session.day_index,
          date,
        });
      });
    });
  }

  return options.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function optionLabel(option: PlannedSessionOption): string {
  return `${formatWeekdayDate(option.session.date)} · Week ${option.weekIndex + 1}`;
}

function plannedSessionLink(option: PlannedSessionOption): PlannedSessionLink {
  return {
    planId: option.plan.id,
    sessionId: option.sessionId,
    weekIndex: option.weekIndex,
    dayIndex: option.dayIndex,
    date: option.session.date,
  };
}

export default function TailoringPage() {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const settings = getSettings();
  const plannedOptions = upcomingPlannedSessions();
  const [sourceText, setSourceText] = useState(DEMO_WORKOUTS[0].text);
  const [imagePreview, setImagePreview] = useState<string | undefined>();
  const [imageName, setImageName] = useState<string | undefined>();
  const [parsed, setParsed] = useState<ParsedWorkout | null>(null);
  const [selectedPlannedSession, setSelectedPlannedSession] = useState<PlannedSessionOption | null>(null);
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>(settings.preferredDisplayStyle);
  const [feedback, setFeedback] = useState("");
  const [adjusted, setAdjusted] = useState<AdjustedWorkout | null>(null);
  const [inputs, setInputs] = useState<TailoringInputs>({
    runContext: "treadmill",
    outputFormat: settings.preferredOutputMode,
    easyPace: settings.defaultEasyPace,
    cooldownPace: settings.defaultCooldownPace,
    restWalkSpeed: settings.defaultRestWalkSpeed,
    feeling: 7,
    push: "normal"
  });

  function parse() {
    setParsed(selectedPlannedSession
      ? plannedSessionToParsedWorkout(selectedPlannedSession.session)
      : parseWorkoutText(sourceText)
    );
    setAdjusted(null);
  }

  function pickPlannedSession(option: PlannedSessionOption) {
    const nextParsed = plannedSessionToParsedWorkout(option.session);
    setSelectedPlannedSession(option);
    setSourceText(plannedSessionToWorkoutText(option.session));
    setImagePreview(undefined);
    setImageName(undefined);
    setParsed(nextParsed);
    setAdjusted(null);
  }

  function updateSourceText(value: string) {
    setSourceText(value);
    setSelectedPlannedSession(null);
    setParsed(null);
    setAdjusted(null);
  }

  function uploadImage(file: File | undefined) {
    if (!file) return;
    setSelectedPlannedSession(null);
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(String(reader.result));
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  }

  function generate(nextFeedback?: string) {
    const currentParsed = parsed ?? parseWorkoutText(sourceText);
    setParsed(currentParsed);
    const next = tailorWorkout(currentParsed, inputs, nextFeedback);
    setAdjusted(next);
    saveSettings({
      ...settings,
      defaultEasyPace: inputs.easyPace,
      defaultCooldownPace: inputs.cooldownPace,
      defaultRestWalkSpeed: inputs.restWalkSpeed ?? settings.defaultRestWalkSpeed,
      preferredOutputMode: inputs.outputFormat,
      preferredDisplayStyle: displayStyle
    });
  }

  function save() {
    if (!parsed || !adjusted) return;
    const now = new Date().toISOString();
    const linkedSession = selectedPlannedSession ? plannedSessionLink(selectedPlannedSession) : undefined;
    const adjustment: WorkoutAdjustment = {
      id: crypto.randomUUID(),
      inputs: adjusted.inputs,
      adjustedWorkout: adjusted,
      displayStyle,
      feedbackPrompt: feedback || undefined,
      revisionNumber: 1,
      createdAt: now
    };

    const existing = linkedSession
      ? getWorkoutForPlannedSession(linkedSession.planId, linkedSession.sessionId)
      : undefined;
    const workout: SavedWorkout = existing
      ? {
          ...existing,
          title: parsed.title,
          sourceText,
          parsedWorkout: parsed,
          plannedSession: linkedSession,
          adjustments: [
            ...existing.adjustments,
            {
              ...adjustment,
              revisionNumber: (existing.adjustments.at(-1)?.revisionNumber ?? 0) + 1,
            },
          ],
          updatedAt: now,
        }
      : {
          id: crypto.randomUUID(),
          title: parsed.title,
          sourceType: linkedSession ? "plan" : imagePreview ? "image" : "text",
          sourceText,
          sourceImageDataUrl: imagePreview,
          plannedSession: linkedSession,
          parsedWorkout: parsed,
          adjustments: [adjustment],
          createdAt: now,
          updatedAt: now
        };
    saveWorkout(workout);
    router.push(`/app/workouts/${workout.id}`);
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          <h1>Adapt workout</h1>
          <p>Paste a workout, upload a screenshot, or pick a planned session. {BRAND_NAME} adapts it to how you feel today.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <section className="panel stack">
            <h2>1. Source</h2>
            <div className="field">
              <label>Pick from your plan</label>
              <div className="saved-list">
                {plannedOptions.length > 0 ? plannedOptions.map((option) => (
                  <button
                    className="review-item plan-pick-option"
                    key={`${option.plan.id}-${option.sessionId}`}
                    onClick={() => pickPlannedSession(option)}
                    style={{ textAlign: "left", width: "100%" }}
                    type="button"
                  >
                    <strong>{option.session.description}</strong>
                    <div className="muted">
                      {optionLabel(option)} · {option.plan.plan.meta.goal_race} plan
                      {option.session.target_km ? ` · ${option.session.target_km.toFixed(1)} km` : ""}
                    </div>
                  </button>
                )) : (
                  <div className="review-item">
                    <strong>No upcoming planned runs</strong>
                    <div className="muted">Paste or upload an ad-hoc workout below.</div>
                  </div>
                )}
              </div>
              {selectedPlannedSession && (
                <div className="tag-row" style={{ marginTop: 8 }}>
                  <span className="tag">
                    <CalendarDays size={14} />
                    Linked to {optionLabel(selectedPlannedSession)}
                  </span>
                </div>
              )}
            </div>
            <div className="field">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <label htmlFor="source">Workout text</label>
                <div className="button-row" style={{ gap: 4 }}>
                  {DEMO_WORKOUTS.map((demo) => (
                    <button
                      key={demo.label}
                      className="button ghost compact"
                      type="button"
                      onClick={() => updateSourceText(demo.text)}
                    >
                      {demo.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea className="textarea" id="source" value={sourceText} onChange={(event) => updateSourceText(event.target.value)} />
            </div>
            {imagePreview && (
              <div className="image-preview">
                <img src={imagePreview} alt={imageName ?? "Uploaded workout screenshot"} />
                <span className="tag">Screenshot attached: {imageName}</span>
                <p className="muted">Local OCR is not configured yet, so extraction still uses the pasted workout text.</p>
              </div>
            )}
            <div className="button-row">
              <label className="button" htmlFor="workout-image">
                <Upload size={17} />
                Upload screenshot
              </label>
              <input
                className="hidden"
                id="workout-image"
                type="file"
                accept="image/*"
                onChange={(event) => uploadImage(event.target.files?.[0])}
              />
              <button className="button primary" onClick={parse} type="button">
                Review extraction
              </button>
            </div>
          </section>

          {parsed && (
            <section className="panel stack">
              <h2>2. Review extracted workout</h2>
              <div className="tag-row">
                {parsed.uncertaintyFlags.map((flag) => (
                  <span className="tag warn" key={flag}>
                    {flag}
                  </span>
                ))}
                {parsed.uncertaintyFlags.length === 0 && <span className="tag">No review flags</span>}
              </div>
              <div className="review-list">
                {parsed.steps.map((step) => (
                  <div className="review-item" key={step.id}>
                    <strong>{step.label}</strong>
                    <div className="muted">
                      {step.type}
                      {step.reps ? ` - ${step.reps} reps` : ""}
                      {step.distanceKm ? ` - ${step.distanceKm} km` : ""}
                      {step.targetPace ? ` - ${step.targetPace}/km` : ""}
                      {step.restSeconds ? ` - ${step.restSeconds} sec rest` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel stack">
            <h2>3. Adaptation inputs</h2>
            <div className="grid-2">
              <div className="field">
                <label>Run context</label>
                <select className="select" value={inputs.runContext} onChange={(event) => setInputs({ ...inputs, runContext: event.target.value as TailoringInputs["runContext"] })}>
                  <option value="treadmill">Treadmill</option>
                  <option value="free-run">Free run</option>
                </select>
              </div>
              <div className="field">
                <label>Output format</label>
                <select className="select" value={inputs.outputFormat} onChange={(event) => setInputs({ ...inputs, outputFormat: event.target.value as TailoringInputs["outputFormat"] })}>
                  <option value="treadmill-time">Treadmill time-based</option>
                  <option value="treadmill-distance">Treadmill distance-based</option>
                  <option value="general">General running plan</option>
                </select>
              </div>
            </div>
            <div className="grid-3">
              <div className="field">
                <label>Easy/warm-up pace</label>
                <input className="input" value={inputs.easyPace} onChange={(event) => setInputs({ ...inputs, easyPace: event.target.value })} />
              </div>
              <div className="field">
                <label>Recovery pace</label>
                <input className="input" value={inputs.cooldownPace} onChange={(event) => setInputs({ ...inputs, cooldownPace: event.target.value })} />
              </div>
              <div className="field">
                <label>Walk rest speed</label>
                <input className="input" type="number" step="0.1" value={inputs.restWalkSpeed ?? ""} onChange={(event) => setInputs({ ...inputs, restWalkSpeed: Number(event.target.value) })} />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Feeling: {inputs.feeling}/10</label>
                <input className="input" type="range" min="1" max="10" value={inputs.feeling} onChange={(event) => setInputs({ ...inputs, feeling: Number(event.target.value) })} />
              </div>
              <div className="field">
                <label>Desired push</label>
                <div className="segmented">
                  {(["easy", "normal", "hard"] as const).map((push) => (
                    <button className={inputs.push === push ? "selected" : ""} key={push} onClick={() => setInputs({ ...inputs, push })} type="button">
                      {push}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field">
              <label>Output view</label>
              <div className="segmented" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                {(["table", "steps"] as const).map((style) => (
                  <button className={displayStyle === style ? "selected" : ""} key={style} onClick={() => setDisplayStyle(style)} type="button">
                    {style}
                  </button>
                ))}
              </div>
            </div>
            <button className="button primary" type="button" onClick={() => generate()}>
              <Sparkles size={17} />
              Generate adapted workout
            </button>
          </section>
        </div>

        <aside className="stack">
          {adjusted ? (
            <>
              <AdjustedWorkoutCard workout={adjusted} displayStyle={displayStyle} cardRef={cardRef} />
              <section className="panel stack">
                <h2>Satisfaction check</h2>
                <p className="muted">If this misses the intent, describe the change and regenerate from the same reviewed workout.</p>
                <textarea className="textarea" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Example: make the first half easier and finish only slightly faster" />
                <div className="button-row">
                  <button className="button" type="button" onClick={() => generate(feedback)}>
                    Regenerate
                  </button>
                  <button className="button primary" type="button" onClick={save}>
                    <Save size={17} />
                    {selectedPlannedSession ? "Save to plan session" : "Save workout"}
                  </button>
                </div>
                <ExportMenu workout={adjusted} cardRef={cardRef} />
              </section>
            </>
          ) : (
            <div className="panel empty">
              <p>Adjusted workout card appears here after generation.</p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
