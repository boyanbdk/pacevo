import { beforeEach, expect, test, vi } from "vitest";
import type { SavedWorkout } from "@/domain/workout-schema";
import {
  clearUser,
  defaultSettings,
  getSettings,
  getUser,
  getWorkoutForPlannedSession,
  getWorkouts,
  saveSettings,
  saveUser,
  saveWorkout,
} from "./storage";

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

test("default settings prefer heart-rate guidance and hide easy pace targets", () => {
  expect(getSettings().intensityMode).toBe("hr");
  expect(getSettings().showEasyRunPaceTargets).toBe(false);
});

test("legacy settings preserve cooldown pace and receive new defaults", () => {
  localStorage.setItem(
    "run-tailor:settings",
    JSON.stringify({
      defaultEasyPace: "6:20",
      defaultCooldownPace: "7:05",
      preferredOutputMode: "general",
      preferredDisplayStyle: "steps",
      brandTheme: "volt",
    }),
  );

  const settings = getSettings();

  expect(settings.defaultCooldownPace).toBe("7:05");
  expect(settings.intensityMode).toBe("hr");
  expect(settings.showEasyRunPaceTargets).toBe(false);
});

test("pacevo settings key is preferred over legacy settings key", () => {
  localStorage.setItem("run-tailor:settings", JSON.stringify({ defaultEasyPace: "7:00" }));
  localStorage.setItem("pacevo:settings", JSON.stringify({ defaultEasyPace: "6:05" }));

  expect(getSettings().defaultEasyPace).toBe("6:05");
});

test("explicit settings survive save and load", () => {
  saveSettings({
    ...defaultSettings,
    intensityMode: "pace",
    showEasyRunPaceTargets: true,
  });

  const settings = getSettings();

  expect(settings.intensityMode).toBe("pace");
  expect(settings.showEasyRunPaceTargets).toBe(true);
  expect(localStorage.getItem("pacevo:settings")).not.toBeNull();
  expect(localStorage.getItem("run-tailor:settings")).toBeNull();
});

test("corrupt legacy settings fall back safely", () => {
  localStorage.setItem("run-tailor:settings", "{not-json");

  expect(getSettings()).toMatchObject(defaultSettings);
});

test("legacy auth user loads and saving writes the pacevo user key", () => {
  localStorage.setItem("run-tailor:user", JSON.stringify({ email: "legacy@example.com", createdAt: "2026-05-01T00:00:00.000Z" }));

  expect(getUser()?.email).toBe("legacy@example.com");

  saveUser("pacevo@example.com", "2026-05-02T00:00:00.000Z");

  expect(JSON.parse(localStorage.getItem("pacevo:user") ?? "{}")).toMatchObject({ email: "pacevo@example.com" });
});

test("clearUser removes migrated and legacy auth keys", () => {
  localStorage.setItem("run-tailor:user", JSON.stringify({ email: "legacy@example.com", createdAt: "2026-05-01T00:00:00.000Z" }));
  saveUser("pacevo@example.com", "2026-05-02T00:00:00.000Z");

  clearUser();

  expect(getUser()).toBeNull();
  expect(localStorage.getItem("pacevo:user")).toBeNull();
  expect(localStorage.getItem("run-tailor:user")).toBeNull();
});

test("planned session workouts can be retrieved by linked session id", () => {
  const baseWorkout: SavedWorkout = {
    id: "workout-1",
    title: "Plan workout",
    sourceType: "plan",
    sourceText: "Main set",
    plannedSession: {
      planId: "plan-1",
      sessionId: "0-2",
      weekIndex: 0,
      dayIndex: 2,
      date: "2026-05-06",
    },
    parsedWorkout: {
      title: "Plan workout",
      activityType: "running",
      sourceSummary: "Main set",
      steps: [],
      uncertaintyFlags: [],
    },
    adjustments: [],
    createdAt: "2026-05-04T08:00:00.000Z",
    updatedAt: "2026-05-04T08:00:00.000Z",
  };

  saveWorkout(baseWorkout);
  saveWorkout({
    ...baseWorkout,
    id: "workout-2",
    updatedAt: "2026-05-04T09:00:00.000Z",
  });

  expect(getWorkoutForPlannedSession("plan-1", "0-2")?.id).toBe("workout-2");
  expect(localStorage.getItem("pacevo:workouts")).not.toBeNull();
  expect(localStorage.getItem("run-tailor:workouts")).toBeNull();
});

test("legacy workouts load and next save writes the pacevo workouts key", () => {
  const legacyWorkout: SavedWorkout = {
    id: "legacy-workout",
    title: "Legacy workout",
    sourceType: "text",
    sourceText: "Main set",
    parsedWorkout: {
      title: "Legacy workout",
      activityType: "running",
      sourceSummary: "Main set",
      steps: [],
      uncertaintyFlags: [],
    },
    adjustments: [],
    createdAt: "2026-05-04T08:00:00.000Z",
    updatedAt: "2026-05-04T08:00:00.000Z",
  };
  localStorage.setItem("run-tailor:workouts", JSON.stringify([legacyWorkout]));

  expect(getWorkouts()).toHaveLength(1);
  expect(getWorkouts()[0].id).toBe("legacy-workout");

  saveWorkout({ ...legacyWorkout, id: "pacevo-workout" });

  expect(JSON.parse(localStorage.getItem("pacevo:workouts") ?? "[]").map((workout: SavedWorkout) => workout.id))
    .toEqual(["pacevo-workout", "legacy-workout"]);
  expect(localStorage.getItem("run-tailor:workouts")).not.toBeNull();
});

test("corrupt legacy workouts fall back safely", () => {
  localStorage.setItem("run-tailor:workouts", "{not-json");

  expect(getWorkouts()).toEqual([]);
});
