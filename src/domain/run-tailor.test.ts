import { describe, expect, it } from "vitest";
import { formatPace, parsePace, roundUp10 } from "./pace";
import { parseWorkoutText } from "./parser";
import { adjustedPush } from "./readiness";
import { groupAdjustedSteps, intervalPaces, tailorWorkout } from "./run-tailor";
import type { AdjustedStep, ParsedWorkout, TailoringInputs } from "./workout-schema";

describe("pace helpers", () => {
  it("parses and formats pace", () => {
    expect(parsePace("4:05")).toBe(245);
    expect(formatPace(245)).toBe("4:05");
  });

  it("rounds treadmill durations upward to 10 seconds", () => {
    expect(roundUp10(93)).toBe(100);
    expect(roundUp10(188)).toBe(190);
  });
});

describe("readiness", () => {
  it("downshifts hard days when feeling is low", () => {
    expect(adjustedPush("hard", 2)).toBe("controlled-hard");
  });

  it("allows normal-plus when feeling is high", () => {
    expect(adjustedPush("normal", 9)).toBe("normal-plus");
  });
});

describe("interval planning", () => {
  it("matches the Python normal lane shape for 8 x 800", () => {
    const paces = intervalPaces(8, parsePace("4:00"), [parsePace("3:50"), parsePace("4:10")], "normal", 7);
    expect(paces.map(formatPace)).toEqual(["4:10", "4:00", "4:00", "4:00", "4:00", "4:00", "3:55", "3:50"]);
  });
});

describe("workout parser", () => {
  it("extracts duration-first walking recovery from an interval line", () => {
    const parsed = parseWorkoutText("8 x 800 m @ 4:00, window 3:50-4:10, 90 sec walk recovery");

    expect(parsed.steps[0].restSeconds).toBe(90);
    expect(parsed.uncertaintyFlags).not.toContain("unclear rest duration");
  });
});

describe("tailorWorkout", () => {
  it("generates treadmill time-based steps with rest recoveries", () => {
    const parsed: ParsedWorkout = {
      title: "Track intervals",
      activityType: "running",
      sourceSummary: "8 x 800",
      uncertaintyFlags: [],
      steps: [
        { id: "w", type: "warmup", label: "Warm-up", distanceKm: 2 },
        {
          id: "i",
          type: "interval",
          label: "8 x 800 m",
          reps: 2,
          distanceKm: 0.8,
          targetPace: "4:00",
          paceWindow: ["3:50", "4:10"],
          restSeconds: 90
        },
        { id: "c", type: "cooldown", label: "Cool down", distanceKm: 1.5 }
      ]
    };
    const inputs: TailoringInputs = {
      runContext: "treadmill",
      outputFormat: "treadmill-time",
      easyPace: "6:40",
      cooldownPace: "6:50",
      restWalkSpeed: 5,
      feeling: 7,
      push: "normal"
    };

    const result = tailorWorkout(parsed, inputs);

    expect(result.steps[0].target).toContain("9.0 km/h (6:40/km) for 800 sec");
    expect(result.steps[1].target).toContain("14.4 km/h (4:10/km) for 200 sec");
    expect(result.steps[2].target).toBe("5.0 km/h walk for 90 sec");
    expect(result.steps.at(-1)?.kind).toBe("Recovery");
  });

  it("collapses generated 8x800 structure even when readiness paces vary", () => {
    const parsed: ParsedWorkout = {
      title: "Track intervals",
      activityType: "running",
      sourceSummary: "8 x 800",
      uncertaintyFlags: [],
      steps: [
        {
          id: "i",
          type: "interval",
          label: "8 x 800 m",
          reps: 8,
          distanceKm: 0.8,
          targetPace: "4:00",
          paceWindow: ["3:50", "4:10"],
          restSeconds: 90
        },
      ]
    };
    const inputs: TailoringInputs = {
      runContext: "treadmill",
      outputFormat: "treadmill-time",
      easyPace: "6:40",
      cooldownPace: "6:50",
      restWalkSpeed: 5,
      feeling: 7,
      push: "normal"
    };

    const result = tailorWorkout(parsed, inputs);

    expect(result.steps).toHaveLength(15);
    expect(result.stepGroups).toHaveLength(1);
    expect(result.stepGroups[0]).toMatchObject({ type: "repeat", reps: 8 });
  });

  it("labels parsed recovery distance as recovery", () => {
    const parsed = parseWorkoutText("Recovery 1 km");

    expect(parsed.steps[0].type).toBe("cooldown");
    expect(parsed.steps[0].label).toBe("Recovery");
  });
});

describe("step grouping", () => {
  function interval(id: string, target = "14.4 km/h (4:10/km) for 200 sec"): AdjustedStep {
    return {
      id,
      kind: "Interval",
      label: id,
      target,
      detail: "Raw estimate 198 sec for 800 m.",
      pace: "4:10",
      speedKmh: 14.4,
      durationSeconds: 200,
      distanceLabel: "800 m",
      repeatIndex: Number(id.replace(/\D/g, "")) || undefined,
    };
  }

  function rest(id: string): AdjustedStep {
    return {
      id,
      kind: "Recovery",
      label: id,
      target: "5.0 km/h walk for 90 sec",
      detail: "Controlled recovery before the next quality segment.",
      speedKmh: 5,
      durationSeconds: 90,
    };
  }

  function repeatSteps(reps: number): AdjustedStep[] {
    return Array.from({ length: reps }).flatMap((_, index) => {
      const run = interval(`rep-${index + 1}`);
      return index === reps - 1 ? [run] : [run, rest(`rest-${index + 1}`)];
    });
  }

  it("collapses eight identical reps into one repeat block", () => {
    const groups = groupAdjustedSteps(repeatSteps(8));

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ type: "repeat", reps: 8 });
  });

  it("collapses six identical reps and leaves a decoy as its own row", () => {
    const groups = groupAdjustedSteps([
      ...repeatSteps(6),
      interval("decoy", "14.1 km/h (4:15/km) for 200 sec"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ type: "repeat", reps: 6 });
    expect(groups[1]).toMatchObject({ type: "single" });
  });

  it("does not collapse mixed paces", () => {
    const groups = groupAdjustedSteps([
      { ...interval("rep-1", "14.4 km/h (4:10/km) for 200 sec"), repeatIndex: undefined },
      rest("rest-1"),
      { ...interval("rep-2", "15.0 km/h (4:00/km) for 190 sec"), repeatIndex: undefined },
    ]);

    expect(groups.map((group) => group.type)).toEqual(["single", "single", "single"]);
  });
});
