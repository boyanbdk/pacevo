import { beforeEach, expect, test, vi } from "vitest";
import { buildPlan } from "../domain/training-plan/build-plan";
import type { PlanInputs } from "../domain/training-plan/types";
import { createPlan, getCompletedSession, logSession, savePlan } from "./plan-storage";

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

test("logSession replaces the existing log for the same planned session", () => {
  const plan = createPlan(INPUTS, buildPlan(INPUTS));
  savePlan(plan);

  const first = logSession(plan.id, {
    weekIndex: 0,
    dayIndex: 1,
    date: plan.plan.weeks[0].sessions[0].date,
    actualKm: 5,
    actualDurationMin: 30,
    avgHR: null,
    maxHR: null,
    rpe: 4,
    note: "first",
    source: "manual",
  });

  const second = logSession(plan.id, {
    weekIndex: 0,
    dayIndex: 1,
    date: plan.plan.weeks[0].sessions[0].date,
    actualKm: 6,
    actualDurationMin: 34,
    avgHR: 145,
    maxHR: null,
    rpe: 5,
    note: "updated",
    source: "manual",
  });

  const saved = getCompletedSession(plan.id, 0, 1);

  expect(second.id).toBe(first.id);
  expect(saved?.actualKm).toBe(6);
  expect(saved?.note).toBe("updated");
});
