import { beforeEach, expect, test, vi } from "vitest";
import { buildPlan } from "../domain/training-plan/build-plan";
import type { PlanInputs } from "../domain/training-plan/types";
import {
  attachExistingImportedActivityToSession,
  createPlan,
  detachImportedActivityFromSession,
  getCompletedSession,
  getPlan,
  getPlans,
  getWorkoutFeedbackForSession,
  getWorkoutPreferences,
  applyWorkoutSwap,
  linkImportedActivityToSession,
  logSession,
  movePlannedSessionDate,
  recordWorkoutFeedback,
  savePlan,
} from "./plan-storage";

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
  expect(localStorage.getItem("pacevo:plans")).not.toBeNull();
  expect(localStorage.getItem("run-tailor:plans")).toBeNull();
});

test("imported activity can detach and reattach to another planned session", () => {
  const plan = createPlan(INPUTS, buildPlan(INPUTS));
  savePlan(plan);
  const slots = plan.plan.weeks.flatMap((week, weekIndex) =>
    week.sessions
      .filter((session) => session.type !== "rest")
      .map((session) => ({ weekIndex, dayIndex: session.day_index })),
  );
  const source = slots[0];
  const target = slots[1];
  const activity = {
    id: "gpx:morning-run",
    source: "gpx" as const,
    fileName: "morning-run.gpx",
    name: "Morning run",
    startedAt: `${plan.plan.weeks[source.weekIndex].sessions.find((s) => s.day_index === source.dayIndex)!.date}T07:00:00.000Z`,
    date: plan.plan.weeks[source.weekIndex].sessions.find((s) => s.day_index === source.dayIndex)!.date,
    distanceKm: 7.2,
    durationMin: 41,
    avgHR: 144,
    maxHR: 166,
  };

  const linked = linkImportedActivityToSession(plan.id, activity, source);

  expect(linked.importedActivities).toHaveLength(1);
  expect(linked.importedActivities[0].linkedSessionRef).toEqual(source);
  expect(getCompletedSession(plan.id, source.weekIndex, source.dayIndex)).toMatchObject({
    activityId: activity.id,
    actualKm: 7.2,
    source: "file_import",
  });

  const detached = detachImportedActivityFromSession(plan.id, activity.id);

  expect(detached.importedActivities[0].linkedSessionRef).toBeNull();
  expect(getCompletedSession(plan.id, source.weekIndex, source.dayIndex)).toBeUndefined();

  const reattached = attachExistingImportedActivityToSession(plan.id, activity.id, target);

  expect(reattached.importedActivities[0].linkedSessionRef).toEqual(target);
  expect(getCompletedSession(plan.id, source.weekIndex, source.dayIndex)).toBeUndefined();
  expect(getCompletedSession(plan.id, target.weekIndex, target.dayIndex)).toMatchObject({
    activityId: activity.id,
    actualDurationMin: 41,
  });
});

test("legacy plans load and next save writes the pacevo plans key", () => {
  const legacyPlan = createPlan(INPUTS, buildPlan(INPUTS));
  localStorage.setItem("run-tailor:plans", JSON.stringify([legacyPlan]));

  expect(getPlans()).toHaveLength(1);
  expect(getPlan(legacyPlan.id)?.id).toBe(legacyPlan.id);

  savePlan({
    ...legacyPlan,
    status: "archived",
    updatedAt: "2026-05-05T00:00:00.000Z",
  });

  const saved = JSON.parse(localStorage.getItem("pacevo:plans") ?? "[]") as Array<{ id: string; status: string }>;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ id: legacyPlan.id, status: "archived" });
  expect(localStorage.getItem("run-tailor:plans")).not.toBeNull();
});

test("pacevo plans key is preferred over legacy plans key", () => {
  const legacyPlan = createPlan(INPUTS, buildPlan(INPUTS));
  const pacevoPlan = createPlan(INPUTS, buildPlan(INPUTS));
  localStorage.setItem("run-tailor:plans", JSON.stringify([legacyPlan]));
  localStorage.setItem("pacevo:plans", JSON.stringify([pacevoPlan]));

  expect(getPlans()).toHaveLength(1);
  expect(getPlans()[0].id).toBe(pacevoPlan.id);
});

test("corrupt legacy plans fall back safely", () => {
  localStorage.setItem("run-tailor:plans", "{not-json");

  expect(getPlans()).toEqual([]);
});

test("recordWorkoutFeedback persists event and updates derived preferences", () => {
  const plan = createPlan(INPUTS, buildPlan(INPUTS));
  savePlan(plan);
  const session = plan.plan.weeks
    .flatMap((week) => week.sessions)
    .find((planned) => planned.type !== "rest" && planned.recipe_id && planned.recipe_family);

  expect(session).toBeDefined();

  const event = recordWorkoutFeedback(plan.id, "0-1", session!, "favourite");
  const saved = getPlan(plan.id);
  const latest = getWorkoutFeedbackForSession(plan.id, "0-1");
  const preferences = getWorkoutPreferences(plan.id);

  expect(saved?.workoutFeedback).toHaveLength(1);
  expect(latest?.id).toBe(event.id);
  expect(preferences).toHaveLength(1);
  expect(preferences[0].recipeId).toBe(session!.recipe_id);
  expect(preferences[0].score).toBe(2);
});

test("applyWorkoutSwap creates a new version and records swap feedback", () => {
  const plan = createPlan(INPUTS, buildPlan(INPUTS));
  savePlan(plan);

  const weekIndex = plan.plan.weeks.findIndex((week) =>
    week.sessions.some((session) => session.recipe_id && session.recipe_family && session.type !== "rest"),
  );
  const session = plan.plan.weeks[weekIndex].sessions.find(
    (candidate) => candidate.recipe_id && candidate.recipe_family && candidate.type !== "rest",
  )!;
  const nextSession = {
    ...session,
    recipe_id: `${session.recipe_id}_swap`,
    main_set: "Swapped similar workout",
  };

  const updated = applyWorkoutSwap(plan.id, weekIndex, session.day_index, `${weekIndex}-${session.day_index}`, nextSession);

  expect(updated.versions).toHaveLength(2);
  expect(updated.versions.at(-1)?.reason).toBe("swap");
  expect(updated.versions.at(-1)?.swapFromRecipeId).toBe(session.recipe_id);
  expect(updated.versions.at(-1)?.swapToRecipeId).toBe(nextSession.recipe_id);
  expect(updated.plan.weeks[weekIndex].sessions.find((s) => s.day_index === session.day_index)?.main_set)
    .toBe("Swapped similar workout");
  expect(updated.workoutFeedback.at(-1)?.type).toBe("swap");
});

test("movePlannedSessionDate swaps workout dates and records a user edit version", () => {
  const plan = createPlan(INPUTS, buildPlan(INPUTS));
  savePlan(plan);

  const weekIndex = plan.plan.weeks.findIndex((week) =>
    week.sessions.some((session) => session.type !== "rest" && session.type !== "race"),
  );
  const source = plan.plan.weeks[weekIndex].sessions.find((session) => session.type !== "rest" && session.type !== "race")!;
  const target = plan.plan.weeks[weekIndex].sessions.find((session) => session.type === "rest")!;

  const updated = movePlannedSessionDate(
    plan.id,
    { weekIndex, dayIndex: source.day_index },
    { weekIndex, dayIndex: target.day_index },
  );
  const moved = updated.plan.weeks[weekIndex].sessions.find((session) => session.day_index === target.day_index);
  const rest = updated.plan.weeks[weekIndex].sessions.find((session) => session.day_index === source.day_index);

  expect(updated.versions).toHaveLength(2);
  expect(updated.versions.at(-1)?.reason).toBe("user_edit");
  expect(moved?.type).toBe(source.type);
  expect(moved?.date).toBe(target.date);
  expect(rest?.type).toBe("rest");
});

test("movePlannedSessionDate does not label same-week moves", () => {
  const plan = createPlan(INPUTS, buildPlan(INPUTS));
  savePlan(plan);

  const weekIndex = plan.plan.weeks.findIndex((week) =>
    week.sessions.some((session) => session.type !== "rest" && session.type !== "race"),
  );
  const source = plan.plan.weeks[weekIndex].sessions.find((session) => session.type !== "rest" && session.type !== "race")!;
  const target = plan.plan.weeks[weekIndex].sessions.find((session) => session.type === "rest")!;

  const updated = movePlannedSessionDate(
    plan.id,
    { weekIndex, dayIndex: source.day_index },
    { weekIndex, dayIndex: target.day_index },
  );
  const moved = updated.plan.weeks[weekIndex].sessions.find((session) => session.day_index === target.day_index);

  expect(moved?.type).toBe(source.type);
  expect(moved?.moved_from_week_index).toBeNull();
  expect(moved?.moved_from_day_index).toBeNull();
});

test("movePlannedSessionDate labels cross-week moves with their origin week", () => {
  const plan = createPlan(INPUTS, buildPlan(INPUTS));
  savePlan(plan);

  const sourceWeekIndex = plan.plan.weeks.findIndex((week) =>
    week.sessions.some((session) => session.type === "easy"),
  );
  const targetWeekIndex = plan.plan.weeks.findIndex((week, index) =>
    index > sourceWeekIndex + 1 && week.sessions.some((session) => session.type === "rest"),
  );
  const source = plan.plan.weeks[sourceWeekIndex].sessions.find((session) => session.type === "easy")!;
  const target = plan.plan.weeks[targetWeekIndex].sessions.find((session) => session.type === "rest")!;

  const updated = movePlannedSessionDate(
    plan.id,
    { weekIndex: sourceWeekIndex, dayIndex: source.day_index },
    { weekIndex: targetWeekIndex, dayIndex: target.day_index },
  );
  const moved = updated.plan.weeks[targetWeekIndex].sessions.find((session) => session.day_index === target.day_index);

  expect(moved?.type).toBe("easy");
  expect(moved?.moved_from_week_index).toBe(sourceWeekIndex);
  expect(moved?.moved_from_day_index).toBe(source.day_index);
});

test("movePlannedSessionDate clears origin labels when sessions return to their original week", () => {
  const plan = createPlan(INPUTS, buildPlan(INPUTS));
  savePlan(plan);

  const sourceWeekIndex = plan.plan.weeks.findIndex((week) =>
    week.sessions.some((session) => session.type === "easy"),
  );
  const targetWeekIndex = plan.plan.weeks.findIndex((week, index) =>
    index > sourceWeekIndex + 1 && week.sessions.some((session) => session.type === "rest"),
  );
  const source = plan.plan.weeks[sourceWeekIndex].sessions.find((session) => session.type === "easy")!;
  const target = plan.plan.weeks[targetWeekIndex].sessions.find((session) => session.type === "rest")!;

  const movedAway = movePlannedSessionDate(
    plan.id,
    { weekIndex: sourceWeekIndex, dayIndex: source.day_index },
    { weekIndex: targetWeekIndex, dayIndex: target.day_index },
  );
  expect(movedAway.plan.weeks[targetWeekIndex].sessions.find((session) => session.day_index === target.day_index)?.moved_from_week_index)
    .toBe(sourceWeekIndex);

  const movedBack = movePlannedSessionDate(
    plan.id,
    { weekIndex: targetWeekIndex, dayIndex: target.day_index },
    { weekIndex: sourceWeekIndex, dayIndex: source.day_index },
  );
  const restored = movedBack.plan.weeks[sourceWeekIndex].sessions.find((session) => session.day_index === source.day_index);

  expect(restored?.type).toBe(source.type);
  expect(restored?.moved_from_week_index).toBeNull();
  expect(restored?.moved_from_day_index).toBeNull();
});

test("movePlannedSessionDate blocks edits that create consecutive hard days", () => {
  const plan = createPlan(INPUTS, buildPlan(INPUTS));
  const custom = {
    ...plan,
    plan: {
      ...plan.plan,
      weeks: [
        {
          ...plan.plan.weeks[0],
          sessions: plan.plan.weeks[0].sessions.map((session) => {
            if (session.day_index === 1) return { ...session, type: "tempo" as const, session_role: "quality" as const };
            if (session.day_index === 2) return { ...session, type: "rest" as const, session_role: "rest" as const, target_km: null };
            if (session.day_index === 3) return { ...session, type: "interval" as const, session_role: "quality" as const };
            return session;
          }),
        },
        ...plan.plan.weeks.slice(1),
      ],
    },
  };
  savePlan(custom);

  expect(() => movePlannedSessionDate(
    plan.id,
    { weekIndex: 0, dayIndex: 3 },
    { weekIndex: 0, dayIndex: 2 },
  )).toThrow(/consecutive hard days/);
});
