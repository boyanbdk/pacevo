"use client";

import { useState } from "react";
import { groupAdjustedSteps } from "@/domain/run-tailor";
import type { AdjustedStepGroup, AdjustedWorkout, DisplayStyle } from "@/domain/workout-schema";
import { BRAND_NAME } from "@/lib/brand";

export function AdjustedWorkoutCard({
  workout,
  displayStyle,
  cardRef
}: {
  workout: AdjustedWorkout;
  displayStyle: DisplayStyle;
  cardRef?: React.Ref<HTMLDivElement>;
}) {
  const [showEveryRep, setShowEveryRep] = useState(false);
  const groupedSteps = workout.stepGroups ?? groupAdjustedSteps(workout.steps);
  const hasRepeatGroups = groupedSteps.some((group) => group.type === "repeat");
  const canToggleEveryRep = workout.inputs.runContext === "treadmill" && hasRepeatGroups;
  const visibleGroups: AdjustedStepGroup[] = showEveryRep
    ? workout.steps.map((step) => ({ id: `single-${step.id}`, type: "single", step }))
    : groupedSteps;

  return (
    <div className="workout-card" ref={cardRef}>
      <div className="workout-card-header">
        <div>
          <div className="card-kicker">{BRAND_NAME} Adapt / {workout.lane}</div>
          <h2>{workout.title}</h2>
          <p className="muted">{workout.summary}</p>
        </div>
        <div className="tag-row">
          <span className="tag">{formatOutput(workout.inputs.outputFormat)}</span>
          <span className="tag">feeling {workout.inputs.feeling}/10</span>
          <span className="tag">{workout.inputs.push}</span>
        </div>
      </div>

      {canToggleEveryRep && (
        <div className="workout-card-tools">
          <button className="button ghost compact" type="button" onClick={() => setShowEveryRep((value) => !value)}>
            {showEveryRep ? "Show repeat blocks" : "Show every rep"}
          </button>
        </div>
      )}

      {displayStyle === "table" ? (
        <table className="step-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Step</th>
              <th>Target</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map((group, index) => (
              <tr key={group.id}>
                <td>{index + 1}</td>
                <GroupCells group={group} />
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="step-list">
          {visibleGroups.map((group, index) => (
            <div className={`step-row${group.type === "repeat" ? " repeat-step-row" : ""}`} key={group.id}>
              <span className="step-index">{index + 1}</span>
              <GroupBlock group={group} />
            </div>
          ))}
        </div>
      )}

      <div className="tag-row" style={{ marginTop: 18 }}>
        {workout.notes.map((note) => (
          <span className="tag" key={note}>
            {note}
          </span>
        ))}
      </div>
    </div>
  );
}

function GroupCells({ group }: { group: AdjustedStepGroup }) {
  if (group.type === "single") {
    return (
      <>
        <td>
          <strong>{group.step.kind}</strong>
          <div className="muted">{group.step.label}</div>
        </td>
        <td>{group.step.target}</td>
        <td className="muted">{group.step.detail}</td>
      </>
    );
  }

  return (
    <>
      <td>
        <strong>Repeat {group.reps}x</strong>
        <div className="muted">{group.run.distanceLabel ?? group.run.label} / recovery</div>
      </td>
      <td>
        <div>{repeatTarget(group)}</div>
        <div className="muted">{group.rest.target}</div>
      </td>
      <td className="muted">{repeatDetail(group)}</td>
    </>
  );
}

function GroupBlock({ group }: { group: AdjustedStepGroup }) {
  if (group.type === "single") {
    return (
      <div>
        <strong>{group.step.kind}</strong>
        <div>{group.step.target}</div>
        <div className="muted">{group.step.label} - {group.step.detail}</div>
      </div>
    );
  }

  return (
    <div>
      <strong>Repeat {group.reps}x</strong>
      <div>{repeatTarget(group)}</div>
      <div className="muted">{group.run.distanceLabel ?? group.run.label} then {group.rest.target}</div>
    </div>
  );
}

function repeatTarget(group: Extract<AdjustedStepGroup, { type: "repeat" }>): string {
  const targets = new Set(group.runs.map((run) => run.target));
  if (targets.size === 1) return group.run.target;
  const paces = [...new Set(group.runs.map((run) => run.pace).filter(Boolean))];
  const speeds = group.runs
    .map((run) => run.speedKmh)
    .filter((speed): speed is number => speed !== undefined);
  const distance = group.run.distanceLabel ?? "Rep";
  if (paces.length > 0 && speeds.length > 0) {
    return `${distance} reps at ${paces.at(-1)}-${paces[0]}/km (${Math.min(...speeds).toFixed(1)}-${Math.max(...speeds).toFixed(1)} km/h)`;
  }
  return `${distance} reps with varied targets`;
}

function repeatDetail(group: Extract<AdjustedStepGroup, { type: "repeat" }>): string {
  const targets = new Set(group.runs.map((run) => run.target));
  const targetNote = targets.size === 1 ? group.run.detail : "Targets vary by rep; show every rep for exact treadmill durations.";
  return `${targetNote} Recovery between reps: ${group.rest.detail}`;
}

function formatOutput(outputFormat: AdjustedWorkout["inputs"]["outputFormat"]) {
  if (outputFormat === "treadmill-time") return "time-based";
  if (outputFormat === "treadmill-distance") return "distance-based";
  return "general";
}
