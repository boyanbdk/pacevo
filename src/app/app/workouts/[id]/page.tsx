"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AdjustedWorkoutCard } from "@/components/AdjustedWorkoutCard";
import { ExportMenu } from "@/components/ExportMenu";
import { tailorWorkout } from "@/domain/run-tailor";
import type { SavedWorkout } from "@/domain/workout-schema";
import { deleteWorkout, getWorkout, saveWorkout } from "@/lib/storage";

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [workout, setWorkout] = useState<SavedWorkout | null>(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    setWorkout(getWorkout(id) ?? null);
  }, [id]);

  if (!workout) {
    return (
      <div className="panel empty">
        <div>
          <p>Workout not found.</p>
          <Link className="button primary" href="/app">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const latest = workout.adjustments.at(-1)!;

  function regenerate() {
    const adjustedWorkout = tailorWorkout(workout!.parsedWorkout, latest.inputs, feedback);
    const nextWorkout = {
      ...workout!,
      adjustments: [
        ...workout!.adjustments,
        {
          ...latest,
          id: crypto.randomUUID(),
          adjustedWorkout,
          feedbackPrompt: feedback,
          revisionNumber: latest.revisionNumber + 1,
          createdAt: new Date().toISOString()
        }
      ],
      updatedAt: new Date().toISOString()
    };
    saveWorkout(nextWorkout);
    setWorkout(nextWorkout);
  }

  function remove() {
    if (!workout) return;
    deleteWorkout(workout.id);
    router.push("/app");
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          <h1>{workout.title}</h1>
          <p>Revision {latest.revisionNumber} - saved {new Date(workout.createdAt).toLocaleString()}</p>
        </div>
        <div className="button-row">
          <ExportMenu workout={latest.adjustedWorkout} cardRef={cardRef} />
          <button className="button danger" onClick={remove}>
            <Trash2 size={17} />
            Delete
          </button>
        </div>
      </div>

      <div className="grid-2">
        <AdjustedWorkoutCard workout={latest.adjustedWorkout} displayStyle={latest.displayStyle} cardRef={cardRef} />
        <section className="panel stack">
          <h2>Regenerate</h2>
          <textarea className="textarea" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Describe what should change in the next revision" />
          <button className="button primary" onClick={regenerate}>
            <RefreshCw size={17} />
            Generate revision
          </button>
          <h2>Revision history</h2>
          <div className="saved-list">
            {workout.adjustments.map((adjustment) => (
              <div className="review-item" key={adjustment.id}>
                <strong>Revision {adjustment.revisionNumber}</strong>
                <div className="muted">{adjustment.feedbackPrompt ?? "Initial generation"}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
