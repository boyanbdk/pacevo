"use client";

import { Activity, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SavedWorkout } from "@/domain/workout-schema";
import { getSettings, getWorkouts } from "@/lib/storage";

export default function DashboardPage() {
  const [workouts, setWorkouts] = useState<SavedWorkout[]>([]);
  const [settings, setSettings] = useState(getSettings());

  useEffect(() => {
    setWorkouts(getWorkouts());
    setSettings(getSettings());
  }, []);

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          <h1>Workout dashboard</h1>
          <p>Saved plans, defaults, and the next workout flow.</p>
        </div>
        <Link className="button primary" href="/app/new">
          <Plus size={18} />
          New workout
        </Link>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="panel">
          <span className="muted">Default easy pace</span>
          <h2>{settings.defaultEasyPace}/km</h2>
        </div>
        <div className="panel">
          <span className="muted">Cool-down pace</span>
          <h2>{settings.defaultCooldownPace}/km</h2>
        </div>
        <div className="panel">
          <span className="muted">Saved workouts</span>
          <h2>{workouts.length}</h2>
        </div>
      </div>

      <section className="panel">
        <h2>Recent workouts</h2>
        {workouts.length === 0 ? (
          <div className="empty">
            <div>
              <Activity size={34} />
              <p>No saved workouts yet.</p>
              <Link className="button primary" href="/app/new">
                Build the first one
              </Link>
            </div>
          </div>
        ) : (
          <div className="saved-list">
            {workouts.map((workout) => {
              const latest = workout.adjustments.at(-1);
              return (
                <Link className="saved-item" href={`/app/workouts/${workout.id}`} key={workout.id}>
                  <div>
                    <strong>{workout.title}</strong>
                    <div className="muted">
                      {latest?.adjustedWorkout.steps.length ?? 0} steps - updated{" "}
                      {new Date(workout.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="tag">{latest?.adjustedWorkout.lane ?? "draft"}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
