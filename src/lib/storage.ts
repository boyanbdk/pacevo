import type { SavedWorkout, UserSettings } from "@/domain/workout-schema";

export const defaultSettings: UserSettings = {
  defaultEasyPace: "6:40",
  defaultCooldownPace: "6:50",
  defaultRestWalkSpeed: 5,
  preferredOutputMode: "treadmill-time",
  preferredDisplayStyle: "table",
  brandTheme: "volt",
  intensityMode: "pace",
};

export type LocalUser = {
  email: string;
  createdAt: string;
};

const userKey = "run-tailor:user";
const settingsKey = "run-tailor:settings";
const workoutsKey = "run-tailor:workouts";

export function getUser(): LocalUser | null {
  return readJson<LocalUser | null>(userKey, null);
}

export function saveUser(email: string): LocalUser {
  const user = { email, createdAt: new Date().toISOString() };
  localStorage.setItem(userKey, JSON.stringify(user));
  return user;
}

export function clearUser() {
  localStorage.removeItem(userKey);
}

export function getSettings(): UserSettings {
  return { ...defaultSettings, ...readJson<Partial<UserSettings>>(settingsKey, {}) };
}

export function saveSettings(settings: UserSettings) {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

export function getWorkouts(): SavedWorkout[] {
  return readJson<SavedWorkout[]>(workoutsKey, []);
}

export function saveWorkout(workout: SavedWorkout) {
  const workouts = getWorkouts();
  const existingIndex = workouts.findIndex((item) => item.id === workout.id);
  const next = existingIndex >= 0 ? workouts.toSpliced(existingIndex, 1, workout) : [workout, ...workouts];
  localStorage.setItem(workoutsKey, JSON.stringify(next));
}

export function getWorkout(id: string): SavedWorkout | undefined {
  return getWorkouts().find((workout) => workout.id === id);
}

export function deleteWorkout(id: string) {
  localStorage.setItem(workoutsKey, JSON.stringify(getWorkouts().filter((workout) => workout.id !== id)));
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
