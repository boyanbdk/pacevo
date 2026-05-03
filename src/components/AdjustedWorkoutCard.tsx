"use client";

import type { AdjustedWorkout, DisplayStyle } from "@/domain/workout-schema";

export function AdjustedWorkoutCard({
  workout,
  displayStyle,
  cardRef
}: {
  workout: AdjustedWorkout;
  displayStyle: DisplayStyle;
  cardRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className="workout-card" ref={cardRef}>
      <div className="workout-card-header">
        <div>
          <div className="card-kicker">Run Tailor / {workout.lane}</div>
          <h2>{workout.title}</h2>
          <p className="muted">{workout.summary}</p>
        </div>
        <div className="tag-row">
          <span className="tag">{formatOutput(workout.inputs.outputFormat)}</span>
          <span className="tag">feeling {workout.inputs.feeling}/10</span>
          <span className="tag">{workout.inputs.push}</span>
        </div>
      </div>

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
            {workout.steps.map((step, index) => (
              <tr key={step.id}>
                <td>{index + 1}</td>
                <td>
                  <strong>{step.kind}</strong>
                  <div className="muted">{step.label}</div>
                </td>
                <td>{step.target}</td>
                <td className="muted">{step.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="step-list">
          {workout.steps.map((step, index) => (
            <div className="step-row" key={step.id}>
              <span className="step-index">{index + 1}</span>
              <div>
                <strong>{step.kind}</strong>
                <div>{step.target}</div>
                <div className="muted">{step.label} - {step.detail}</div>
              </div>
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

function formatOutput(outputFormat: AdjustedWorkout["inputs"]["outputFormat"]) {
  if (outputFormat === "treadmill-time") return "time-based";
  if (outputFormat === "treadmill-distance") return "distance-based";
  return "general";
}
