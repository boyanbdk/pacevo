import { formatDistance, parseDistance, parseDuration } from "./pace";
import type { ParsedWorkout, WorkoutStep } from "./workout-schema";

function makeId(prefix: string, index: number): string {
  return `${prefix}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseWorkoutText(raw: string): ParsedWorkout {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sourceSummary = lines.slice(0, 4).join(" / ");
  const title = inferTitle(lines);
  const steps: WorkoutStep[] = [];
  const uncertaintyFlags = new Set<string>();

  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    const repeat = line.match(
      /(\d+)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*(km|m)\s*(?:@|at|around)?\s*(\d{1,2}:[0-5]\d)?(?:.*?(\d{1,2}:[0-5]\d)\s*[-–]\s*(\d{1,2}:[0-5]\d))?/i
    );
    const distanceOnly = line.match(/(\d+(?:[.,]\d+)?)\s*(km|m)/i);
    const pace = line.match(/(\d{1,2}:[0-5]\d)/);
    const duration = line.match(/(\d+)\s*(sec|s|min|minutes?)/i);

    if (repeat) {
      const rest =
        line.match(/(\d+)\s*(sec|s|min|minutes?)\s*(?:walk|rest|recovery)/i) ??
        line.match(/(?:rest|walk|recovery).*?(\d+)\s*(sec|s|min|minutes?)/i);
      steps.push({
        id: makeId("interval", index),
        type: "interval",
        label: `${repeat[1]} x ${formatDistance(parseDistance(repeat[2], repeat[3]))}`,
        reps: Number(repeat[1]),
        distanceKm: parseDistance(repeat[2], repeat[3]),
        targetPace: repeat[4],
        paceWindow: repeat[5] && repeat[6] ? [repeat[5], repeat[6]] : undefined,
        restSeconds: rest ? parseDuration(rest[1], rest[2]) : undefined
      });
      if (!repeat[4]) uncertaintyFlags.add("missing pace window");
      if (!rest && /rest|walk|recovery/i.test(raw)) uncertaintyFlags.add("unclear rest duration");
      return;
    }

    if (/warm/.test(lower) && distanceOnly) {
      steps.push({
        id: makeId("warmup", index),
        type: "warmup",
        label: "Warm-up",
        distanceKm: parseDistance(distanceOnly[1], distanceOnly[2]),
        targetPace: pace?.[1]
      });
      return;
    }

    if (/cool|down|cd\b/.test(lower) && distanceOnly) {
      steps.push({
        id: makeId("cooldown", index),
        type: "cooldown",
        label: "Cool down",
        distanceKm: parseDistance(distanceOnly[1], distanceOnly[2]),
        targetPace: pace?.[1]
      });
      return;
    }

    if (/rest|walk|recovery/.test(lower) && duration) {
      steps.push({
        id: makeId("rest", index),
        type: "rest",
        label: /walk/.test(lower) ? "Walk" : "Rest",
        durationSeconds: parseDuration(duration[1], duration[2])
      });
      return;
    }

    if (distanceOnly && pace) {
      steps.push({
        id: makeId("run", index),
        type: "run",
        label: "Run",
        distanceKm: parseDistance(distanceOnly[1], distanceOnly[2]),
        targetPace: pace[1]
      });
    }
  });

  if (!steps.some((step) => step.type === "warmup")) uncertaintyFlags.add("missing warm-up");
  if (!steps.some((step) => step.type === "cooldown")) uncertaintyFlags.add("missing cool-down");
  if (steps.length === 0) uncertaintyFlags.add("unknown workout type");

  return {
    title,
    activityType: "running",
    sourceSummary,
    steps,
    uncertaintyFlags: Array.from(uncertaintyFlags)
  };
}

function inferTitle(lines: string[]): string {
  const explicit = lines.find((line) => !/\d/.test(line) && line.length <= 60);
  if (explicit) return explicit;
  const repeatLine = lines.find((line) => /\d+\s*[xX]\s*\d/.test(line));
  if (repeatLine) return "Interval workout";
  return "Running workout";
}
