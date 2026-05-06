import { beforeEach, expect, test, vi } from "vitest";
import type { ImportedActivity } from "../domain/training-plan/activity-import";
import { buildPlan } from "../domain/training-plan/build-plan";
import type { PlanInputs } from "../domain/training-plan/types";
import { createPlan, getCompletedSession, savePlan } from "./plan-storage";
import { importActivityIntoPlan, providerActivityIdForImport } from "./activity-plan-import";

const INPUTS: PlanInputs = {
  goal_race: "10K",
  goal_date: (() => {
    const d = new Date();
    d.setDate(d.getDate() + 70);
    return d.toISOString().slice(0, 10);
  })(),
  current_weekly_km: 30,
  longest_recent_km: 10,
  recent_race: { distance_m: 10000, time_s: 47 * 60 },
  age: 30,
  resting_hr: 55,
  max_hr: null,
  days_per_week: 4,
  session_minutes_cap: null,
  long_run_day: "saturday",
  surface: "road",
  injury_flags: [],
};

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

beforeEach(() => {
  const storage = createMemoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
});

test("importActivityIntoPlan logs Strava provider ids on completed sessions", () => {
  const savedPlan = createPlan(INPUTS, buildPlan(INPUTS));
  savePlan(savedPlan);
  const target = savedPlan.plan.weeks
    .flatMap((week, weekIndex) => week.sessions.map((session) => ({ weekIndex, session })))
    .find(({ session }) => session.type !== "rest");
  expect(target).toBeDefined();

  const activity: ImportedActivity = {
    id: "strava:12345",
    providerActivityId: "12345",
    source: "strava",
    fileName: "Strava",
    name: "Morning Run",
    startedAt: `${target!.session.date}T06:00:00.000Z`,
    date: target!.session.date,
    distanceKm: target!.session.target_km ?? 5,
    durationMin: 32,
    avgHR: 145,
    maxHR: 171,
  };

  const updated = importActivityIntoPlan(savedPlan, activity, {
    weekIndex: target!.weekIndex,
    dayIndex: target!.session.day_index,
  });
  const completed = getCompletedSession(updated.id, target!.weekIndex, target!.session.day_index);

  expect(providerActivityIdForImport(activity)).toBe("12345");
  expect(completed).toMatchObject({
    source: "strava",
    providerActivityId: "12345",
    actualDurationMin: 32,
    avgHR: 145,
    maxHR: 171,
  });
});
