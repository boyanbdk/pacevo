import { expect, test } from "vitest";
import { formatWeekWarning, parsePlanWarning, splitPlanWarnings } from "./warnings";

test("formatWeekWarning emits the stable week prefix", () => {
  expect(formatWeekWarning(6, "training load rises too quickly.")).toBe(
    "Week 6: training load rises too quickly."
  );
});

test("parsePlanWarning separates week-scoped warnings from plan warnings", () => {
  expect(parsePlanWarning("Week 7: cut back before the race.")).toEqual({
    scope: "week",
    weekNumber: 7,
    message: "cut back before the race.",
  });
  expect(parsePlanWarning("Your recent mileage is below the usual range.")).toEqual({
    scope: "plan",
    message: "Your recent mileage is below the usual range.",
  });
});

test("splitPlanWarnings keeps plan warnings global and buckets week warnings", () => {
  expect(
    splitPlanWarnings([
      "Your recent mileage is below the usual range.",
      "Week 6: training load rises too quickly.",
      "Week 7: long run is too much of weekly volume.",
      "Week 6: six consecutive load weeks without a cutback.",
    ])
  ).toEqual({
    planWarnings: ["Your recent mileage is below the usual range."],
    warningsByWeekNumber: {
      6: [
        "training load rises too quickly.",
        "six consecutive load weeks without a cutback.",
      ],
      7: ["long run is too much of weekly volume."],
    },
  });
});
