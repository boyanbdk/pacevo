import { describe, expect, test } from "vitest";
import type { HrZones } from "./types";
import { renderIntensity } from "./training-intensity";

const HR_ZONES: HrZones = {
  Z1: [95, 113],
  Z2: [114, 132],
  Z3: [133, 151],
  Z4: [152, 170],
  Z5: [171, 189],
};

describe("renderIntensity", () => {
  test("easy runs suppress pace targets by default", () => {
    const display = renderIntensity("easy", 360, 420, "Z2", 4, HR_ZONES, "pace");

    expect(display.displayMode).toBe("hr");
    expect(display.primaryLabel).toBe("Z2 — Easy");
    expect(display.primaryValue).toBe("114–132 bpm");
    expect(display.secondary.map((item) => item.label)).not.toContain("Pace (ref)");
  });

  test("easy pace targets can be explicitly enabled", () => {
    const display = renderIntensity("easy", 360, 420, "Z2", 4, HR_ZONES, "pace", {
      showEasyRunPaceTargets: true,
      easyPaceTarget: "6:40",
    });

    expect(display.displayMode).toBe("pace");
    expect(display.primaryLabel).toBe("Pace setting");
    expect(display.primaryValue).toBe("6:40 /km");
  });

  test("recovery pace targets use user settings instead of derived paces", () => {
    const display = renderIntensity("recovery", 390, 420, "Z1", 2, HR_ZONES, "pace", {
      showEasyRunPaceTargets: true,
      easyPaceTarget: "6:40",
      recoveryPaceTarget: "7:05",
    });

    expect(display.displayMode).toBe("pace");
    expect(display.primaryValue).toBe("7:05 /km");
  });

  test("hard sessions still expose pace as a reference in HR mode", () => {
    const display = renderIntensity("tempo", 300, 300, "Z4", 7, HR_ZONES, "hr");

    expect(display.displayMode).toBe("hr");
    expect(display.secondary).toContainEqual({ label: "Pace (ref)", value: "5:00 /km" });
    expect(display.warning).toBeTruthy();
  });
});
