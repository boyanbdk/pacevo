import type { SavedWorkout, UserSettings } from "@/domain/workout-schema";

export const defaultSettings: UserSettings = {
  defaultEasyPace: "6:40",
  defaultCooldownPace: "6:50",
  defaultRestWalkSpeed: 5,
  preferredOutputMode: "treadmill-time",
  preferredDisplayStyle: "table",
  brandTheme: "volt",
  intensityMode: "hr",
  showEasyRunPaceTargets: false,
};

export type LocalUser = {
  email: string;
  createdAt: string;
};

const storageKeys = {
  user: "pacevo:user",
  settings: "pacevo:settings",
  workouts: "pacevo:workouts",
} as const;

const legacyStorageKeys = {
  user: "run-tailor:user",
  settings: "run-tailor:settings",
  workouts: "run-tailor:workouts",
} as const;

export function getUser(): LocalUser | null {
  return readJson<LocalUser | null>(storageKeys.user, null, legacyStorageKeys.user);
}

export function saveUser(email: string, createdAt = new Date().toISOString()): LocalUser {
  const user = { email, createdAt };
  localStorage.setItem(storageKeys.user, JSON.stringify(user));
  return user;
}

export function clearUser() {
  localStorage.removeItem(storageKeys.user);
  localStorage.removeItem(legacyStorageKeys.user);
}

export function getSettings(): UserSettings {
  const saved = readJson<Partial<UserSettings>>(storageKeys.settings, {}, legacyStorageKeys.settings);
  return {
    ...defaultSettings,
    ...saved,
    defaultCooldownPace: saved.defaultCooldownPace ?? defaultSettings.defaultCooldownPace,
    intensityMode: saved.intensityMode ?? defaultSettings.intensityMode,
    showEasyRunPaceTargets: saved.showEasyRunPaceTargets ?? defaultSettings.showEasyRunPaceTargets,
  };
}

export function saveSettings(settings: UserSettings) {
  localStorage.setItem(storageKeys.settings, JSON.stringify(settings));
}

export function getWorkouts(): SavedWorkout[] {
  return readJson<SavedWorkout[]>(storageKeys.workouts, [], legacyStorageKeys.workouts);
}

export function saveWorkout(workout: SavedWorkout) {
  const workouts = getWorkouts();
  const existingIndex = workouts.findIndex((item) => item.id === workout.id);
  const next = existingIndex >= 0 ? workouts.toSpliced(existingIndex, 1, workout) : [workout, ...workouts];
  localStorage.setItem(storageKeys.workouts, JSON.stringify(next));
}

export function getWorkout(id: string): SavedWorkout | undefined {
  return getWorkouts().find((workout) => workout.id === id);
}

export function getWorkoutForPlannedSession(
  planId: string,
  sessionId: string,
): SavedWorkout | undefined {
  return getWorkouts()
    .filter((workout) =>
      workout.plannedSession?.planId === planId &&
      workout.plannedSession?.sessionId === sessionId
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

export function deleteWorkout(id: string) {
  localStorage.setItem(storageKeys.workouts, JSON.stringify(getWorkouts().filter((workout) => workout.id !== id)));
}

function readJson<T>(key: string, fallback: T, legacyKey?: string): T {
  if (typeof window === "undefined") return fallback;
  const value = readJsonValue<T>(key);
  if (value.ok) return value.value;
  if (value.found || !legacyKey) return fallback;
  const legacyValue = readJsonValue<T>(legacyKey);
  return legacyValue.ok ? legacyValue.value : fallback;
}

function readJsonValue<T>(key: string): { ok: true; value: T } | { ok: false; found: boolean } {
  const value = localStorage.getItem(key);
  if (value === null) return { ok: false, found: false };
  try {
    return { ok: true, value: JSON.parse(value) as T };
  } catch {
    return { ok: false, found: true };
  }
}
