import { describe, expect, it } from "vitest";
import { formatPace, parsePace, roundUp10 } from "./pace";
import { parseWorkoutText } from "./parser";
import { adjustedPush } from "./readiness";
import { intervalPaces, tailorWorkout } from "./run-tailor";
import type { ParsedWorkout, TailoringInputs } from "./workout-schema";

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
  });
});
