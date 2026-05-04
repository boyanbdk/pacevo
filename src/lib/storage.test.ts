import { beforeEach, expect, test, vi } from "vitest";
import type { SavedWorkout } from "@/domain/workout-schema";
import { defaultSettings, getSettings, getWorkoutForPlannedSession, saveSettings, saveWorkout } from "./storage";

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

test("explicit settings survive save and load", () => {
  saveSettings({
    ...defaultSettings,
    intensityMode: "pace",
    showEasyRunPaceTargets: true,
  });

  const settings = getSettings();

  expect(settings.intensityMode).toBe("pace");
  expect(settings.showEasyRunPaceTargets).toBe(true);
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
});
