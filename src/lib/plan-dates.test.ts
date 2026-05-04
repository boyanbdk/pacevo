import { describe, expect, test } from "vitest";
import type { TrainingWeek } from "@/domain/training-plan/types";
import { formatFullPlanDate, formatWeekRange, formatWeekdayDate, parsePlanDate } from "./plan-dates";

describe("plan date helpers", () => {
  test("parses plan date strings as local calendar dates", () => {
    const parsed = parsePlanDate("2026-05-04");

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(4);
    expect(parsed.getDate()).toBe(4);
  });

  test("formats session and week labels for visible plan dates", () => {
    expect(formatWeekdayDate("2026-05-04")).toBe("Mon, May 4");
    expect(formatFullPlanDate("2026-05-04")).toBe("Monday, May 4, 2026");

    const week = {
      sessions: [
        { date: "2026-05-04" },
        { date: "2026-05-05" },
        { date: "2026-05-06" },
        { date: "2026-05-07" },
        { date: "2026-05-08" },
        { date: "2026-05-09" },
        { date: "2026-05-10" },
      ],
    } as unknown as TrainingWeek;

    expect(formatWeekRange(week)).toBe("May 4 - May 10");
  });
});
