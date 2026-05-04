import { describe, expect, test } from "vitest";
import type { Paces } from "@/domain/training-plan/types";
import type { UserSettings } from "@/domain/workout-schema";
import { defaultSettings } from "./storage";
import { planSettingsSummary, sessionPaceReferenceItems, settingPaceLabel } from "./plan-display";

const PACES: Paces = {
  E_low: 317,
  E_high: 355,
  M: 285,
  T: 265,
  I: 245,
  R: 225,
};

const SETTINGS: UserSettings = {
  ...defaultSettings,
  defaultEasyPace: "6:40",
  defaultCooldownPace: "7:05",
  showEasyRunPaceTargets: false,
};

describe("plan display pace helpers", () => {
  test("plan header uses settings copy rather than derived easy pace", () => {
    const summary = planSettingsSummary(SETTINGS, PACES);

    expect(summary.headline).toBe("6:40 /km");
    expect(summary.details).toContain("Easy setting");
    expect(summary.details).toContain("7:05 /km recovery setting");
    expect(`${summary.headline} ${summary.details}`).not.toContain("5:17");
    expect(`${summary.headline} ${summary.details}`).not.toContain("/km easy");
  });

  test("session detail hides easy and recovery pace references by default", () => {
    expect(sessionPaceReferenceItems("easy", PACES, SETTINGS, false)).toEqual([]);
    expect(sessionPaceReferenceItems("recovery", PACES, SETTINGS, false)).toEqual([]);
  });

  test("session detail uses settings when easy pace targets are enabled", () => {
    expect(sessionPaceReferenceItems("easy", PACES, SETTINGS, true)).toEqual([
      { label: "Easy setting", value: "6:40 /km" },
      { label: "Recovery setting", value: "7:05 /km" },
    ]);
  });

  test("hard session pace references still use generated hard paces", () => {
    expect(sessionPaceReferenceItems("tempo", PACES, SETTINGS, false)).toEqual([
      { label: "Marathon pace", value: "4:45 /km" },
      { label: "Threshold", value: "4:25 /km" },
      { label: "Interval", value: "4:05 /km" },
    ]);
  });

  test("setting pace labels normalize slash variants", () => {
    expect(settingPaceLabel("6:40")).toBe("6:40 /km");
    expect(settingPaceLabel("6:40 /km")).toBe("6:40 /km");
  });
});
