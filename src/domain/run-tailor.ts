import {
  formatDistance,
  formatDuration,
  formatPace,
  paceToKmh,
  parsePace,
  roundTo5,
  roundUp10
} from "./pace";
import { adjustedPush, feedbackAdjustedPush } from "./readiness";
import type {
  AdjustedStep,
  AdjustedWorkout,
  ParsedWorkout,
  TailoringInputs,
  WorkoutStep
} from "./workout-schema";

function normalizePaceWindow(window: [string, string] | undefined, target: string): [number, number] {
  if (!window) {
    const targetSeconds = parsePace(target);
    return [targetSeconds - 10, targetSeconds + 10];
  }
  const first = parsePace(window[0]);
  const second = parsePace(window[1]);
  return [Math.min(first, second), Math.max(first, second)];
}

export function intervalPaces(
  reps: number,
  targetSeconds: number,
  paceWindow: [number, number],
  push: TailoringInputs["push"],
  feeling: number
): number[] {
  const [fast, slow] = paceWindow;
  const lane = adjustedPush(push, feeling);
  const controlledFast = roundTo5((targetSeconds + fast) / 2);
  const easyStart = slow + (feeling <= 6 ? 10 : 5);
  const hardFinish = fast - (lane === "hard-plus" ? 10 : 5);

  if (reps <= 0) throw new Error("reps must be positive");

  if (lane === "easy") {
    const paces = [easyStart, ...Array(Math.max(0, reps - 1)).fill(slow)];
    if (feeling >= 8 && reps >= 4) paces[reps - 1] = Math.min(targetSeconds, slow);
    return paces.slice(0, reps);
  }

  if (lane === "easy-normal") {
    const paces = [easyStart, ...Array(Math.max(0, reps - 1)).fill(slow)];
    if (reps >= 4) paces[reps - 1] = targetSeconds;
    return paces.slice(0, reps);
  }

  if (lane === "controlled-hard") {
    const paces = [slow, ...Array(Math.max(0, reps - 1)).fill(targetSeconds)];
    if (reps >= 4) paces[reps - 1] = controlledFast;
    return paces.slice(0, reps);
  }

  if (lane === "normal") {
    const paces = [slow, ...Array(Math.max(0, reps - 1)).fill(targetSeconds)];
    if (reps >= 6) paces.splice(reps - 2, 2, controlledFast, fast);
    else if (reps >= 3) paces[reps - 1] = controlledFast;
    return paces.slice(0, reps);
  }

  if (lane === "normal-plus") {
    const paces = [slow, ...Array(Math.max(0, reps - 1)).fill(targetSeconds)];
    if (reps >= 5) paces.splice(reps - 3, 3, controlledFast, controlledFast, fast);
    else if (reps >= 3) paces[reps - 1] = fast;
    return paces.slice(0, reps);
  }

  const paces = [targetSeconds, ...Array(Math.max(0, reps - 1)).fill(controlledFast)];
  if (reps >= 4) paces.splice(reps - 2, 2, fast, hardFinish);
  else if (reps >= 2) paces[reps - 1] = fast;
  return paces.slice(0, reps);
}

export function tailorWorkout(
  parsed: ParsedWorkout,
  inputs: TailoringInputs,
  feedbackPrompt?: string
): AdjustedWorkout {
  const effectiveInputs = {
    ...inputs,
    push: feedbackAdjustedPush(inputs.push, feedbackPrompt)
  };
  const lane = adjustedPush(effectiveInputs.push, effectiveInputs.feeling);
  const steps = parsed.steps.flatMap((step) => tailorStep(step, effectiveInputs));
  const notes = [
    `Readiness lane: ${lane}.`,
    feedbackPrompt ? `Regenerated with feedback: ${feedbackPrompt}` : "Generated from reviewed workout structure."
  ];

  if (parsed.uncertaintyFlags.length > 0) {
    notes.push(`Review flags: ${parsed.uncertaintyFlags.join(", ")}.`);
  }

  return {
    title: parsed.title,
    lane,
    inputs: effectiveInputs,
    summary: `${steps.length} execution steps for ${formatRunContext(inputs.runContext)}.`,
    steps,
    notes,
    generatedAt: new Date().toISOString()
  };
}

function formatRunContext(value: TailoringInputs["runContext"]): string {
  return value === "free-run" ? "free run" : "treadmill";
}

function tailorStep(step: WorkoutStep, inputs: TailoringInputs): AdjustedStep[] {
  if (step.type === "interval" && step.reps && step.distanceKm && step.targetPace) {
    const target = parsePace(step.targetPace);
    const paces = intervalPaces(step.reps, target, normalizePaceWindow(step.paceWindow, step.targetPace), inputs.push, inputs.feeling);
    return paces.flatMap((paceSeconds, index) => {
      const run = formatRunStep({
        id: `${step.id}-rep-${index + 1}`,
        kind: "Interval",
        label: `Rep ${index + 1} of ${step.reps}`,
        distanceKm: step.distanceKm,
        paceSeconds,
        inputs,
        repeatIndex: index + 1
      });
      const rest = step.restSeconds
        ? [
            formatRestStep({
              id: `${step.id}-rest-${index + 1}`,
              label: index === step.reps! - 1 ? "Final recovery" : "Walk recovery",
              restSeconds: step.restSeconds,
              inputs
            })
          ]
        : [];
      return index === step.reps! - 1 ? [run] : [run, ...rest];
    });
  }

  if (step.type === "rest" && step.durationSeconds) {
    return [
      formatRestStep({
        id: step.id,
        label: step.label,
        restSeconds: step.durationSeconds,
        inputs
      })
    ];
  }

  const pace =
    step.type === "warmup"
      ? inputs.easyPace
      : step.type === "cooldown"
        ? inputs.cooldownPace
        : step.targetPace ?? inputs.easyPace;
  const paceSeconds = parsePace(pace);

  return [
    formatRunStep({
      id: step.id,
      kind: labelKind(step.type),
      label: step.label,
      distanceKm: step.distanceKm,
      durationSeconds: step.durationSeconds,
      paceSeconds,
      inputs
    })
  ];
}

function labelKind(type: WorkoutStep["type"]): string {
  if (type === "warmup") return "Warm-up";
  if (type === "cooldown") return "Recovery";
  return "Run";
}

function formatRunStep(args: {
  id: string;
  kind: string;
  label: string;
  distanceKm?: number;
  durationSeconds?: number;
  paceSeconds: number;
  inputs: TailoringInputs;
  repeatIndex?: number;
}): AdjustedStep {
  const speed = paceToKmh(args.paceSeconds);
  const pace = formatPace(args.paceSeconds);
  const speedAndPace = `${speed.toFixed(1)} km/h (${pace}/km)`;
  const distanceLabel = args.distanceKm ? formatDistance(args.distanceKm) : undefined;

  if (args.inputs.outputFormat === "treadmill-distance" && args.distanceKm) {
    return {
      id: args.id,
      kind: args.kind,
      label: args.label,
      target: `${speedAndPace} until ${distanceLabel}`,
      detail: `Stop at ${distanceLabel}.`,
      pace,
      speedKmh: speed,
      distanceLabel,
      repeatIndex: args.repeatIndex
    };
  }

  if (args.inputs.outputFormat === "general") {
    const target = args.distanceKm
      ? `${distanceLabel} at ${pace}/km (${speed.toFixed(1)} km/h)`
      : `${speedAndPace} for ${formatDuration(args.durationSeconds ?? 0)}`;
    return {
      id: args.id,
      kind: args.kind,
      label: args.label,
      target,
      detail: "Keep the original outdoor structure.",
      pace,
      speedKmh: speed,
      durationSeconds: args.durationSeconds,
      distanceLabel,
      repeatIndex: args.repeatIndex
    };
  }

  const rawSeconds = args.durationSeconds ?? (args.distanceKm ? args.distanceKm * args.paceSeconds : 0);
  const roundedSeconds = roundUp10(rawSeconds);

  return {
    id: args.id,
    kind: args.kind,
    label: args.label,
    target: `${speedAndPace} for ${roundedSeconds} sec`,
    detail: args.distanceKm ? `Raw estimate ${Math.round(rawSeconds)} sec for ${distanceLabel}.` : "Time-based effort.",
    pace,
    speedKmh: speed,
    durationSeconds: roundedSeconds,
    distanceLabel,
    repeatIndex: args.repeatIndex
  };
}

function formatRestStep(args: {
  id: string;
  label: string;
  restSeconds: number;
  inputs: TailoringInputs;
}): AdjustedStep {
  const speed = args.inputs.restWalkSpeed ?? 5;
  const seconds = roundUp10(args.restSeconds);
  return {
    id: args.id,
    kind: "Recovery",
    label: args.label,
    target: `${speed.toFixed(1)} km/h walk for ${seconds} sec`,
    detail: "Controlled recovery before the next quality segment.",
    speedKmh: speed,
    durationSeconds: seconds
  };
}
