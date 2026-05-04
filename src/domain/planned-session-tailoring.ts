import type { PlannedSession } from "@/domain/training-plan/types";
import type { ParsedWorkout, WorkoutStep } from "@/domain/workout-schema";

export function plannedSessionToWorkoutText(session: PlannedSession): string {
  return [
    session.description,
    session.warmup ? `Warm-up: ${session.warmup}` : null,
    session.main_set ? `Main set: ${session.main_set}` : null,
    session.cooldown ? `Cool-down: ${session.cooldown}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function plannedSessionToParsedWorkout(session: PlannedSession): ParsedWorkout {
  const steps: WorkoutStep[] = [
    parseSupportStep("warmup", "Warm-up", session.warmup),
    parseMainSet(session),
    parseSupportStep("cooldown", "Recovery", session.cooldown),
  ].filter((step): step is WorkoutStep => step !== null);

  if (steps.length === 0 && session.type !== "rest") {
    steps.push({
      id: "planned-main",
      type: "run",
      label: session.description,
      distanceKm: session.target_km ?? undefined,
      durationSeconds: session.target_duration_min ? session.target_duration_min * 60 : undefined,
    });
  }

  return {
    title: session.description,
    activityType: "running",
    sourceSummary: [session.warmup, session.main_set, session.cooldown].filter(Boolean).join(" / ") || session.rationale,
    steps,
    uncertaintyFlags: [],
  };
}

function parseSupportStep(
  type: "warmup" | "cooldown",
  label: string,
  text: string | null,
): WorkoutStep | null {
  if (!text) return null;
  const distanceKm = parseDistanceKm(text);
  const durationSeconds = parseDurationSeconds(text);
  return {
    id: `planned-${type}`,
    type,
    label,
    distanceKm: distanceKm ?? undefined,
    durationSeconds: distanceKm ? undefined : durationSeconds ?? undefined,
    targetPace: parsePace(text) ?? undefined,
  };
}

function parseMainSet(session: PlannedSession): WorkoutStep | null {
  const text = session.main_set ?? session.description;
  if (!text || session.type === "rest") return null;

  const repeat = text.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(km|m)\b/i);
  const targetPace = parsePace(text);
  if (repeat && targetPace) {
    return {
      id: "planned-main",
      type: "interval",
      label: `${repeat[1]} x ${formatDistance(parseDistanceKm(`${repeat[2]} ${repeat[3]}`) ?? 0)}`,
      reps: Number(repeat[1]),
      distanceKm: parseDistanceKm(`${repeat[2]} ${repeat[3]}`) ?? undefined,
      targetPace,
      restSeconds: parseRecoverySeconds(text) ?? undefined,
    };
  }

  const distanceKm = parseDistanceKm(text) ?? session.target_km ?? undefined;
  const durationSeconds = parseDurationSeconds(text) ?? (session.target_duration_min ? session.target_duration_min * 60 : undefined);
  return {
    id: "planned-main",
    type: "run",
    label: "Main set",
    distanceKm,
    durationSeconds: distanceKm ? undefined : durationSeconds,
    targetPace: targetPace ?? undefined,
  };
}

function parseDistanceKm(text: string): number | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(km|m)\b/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return match[2].toLowerCase() === "m" ? value / 1000 : value;
}

function parseDurationSeconds(text: string): number | null {
  const match = text.match(/(\d+)(?:\s*[-–]\s*\d+)?\s*(sec|s|min|minutes?)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return /^m/i.test(match[2]) ? value * 60 : value;
}

function parseRecoverySeconds(text: string): number | null {
  const match =
    text.match(/with\s+(\d+)(?:\s*[-–]\s*\d+)?\s*(sec|s|min|minutes?)\b[^,.;]*(?:recover|rest|walk|float)/i) ??
    text.match(/(\d+)(?:\s*[-–]\s*\d+)?\s*(sec|s|min|minutes?)\b[^,.;]*(?:recover|rest|walk|float)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return /^m/i.test(match[2]) ? value * 60 : value;
}

function parsePace(text: string): string | null {
  const match = text.match(/(\d{1,2}:[0-5]\d)\s*(?:\/\s*km|\/km)?/);
  return match?.[1] ?? null;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Number.isInteger(km) ? km.toFixed(0) : km.toFixed(1)} km`;
}
