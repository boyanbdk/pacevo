import { describe, expect, test } from "vitest";
import type { PlanExportModel } from "../export-model";
import { planExportCsvText, planExportIcsText, planExportJsonText } from "./data";

const MODEL: PlanExportModel = {
  brand: {
    name: "Pacevo",
    label: "PACEVO / PLAN. ADAPT. LEARN.",
    motto: "Plan. Adapt. Learn.",
  },
  title: "10K Training Plan",
  subtitle: "Intermediate · 8 weeks · Goal: July 4, 2026",
  meta: {
    goalRace: "10K",
    level: "Intermediate",
    weeksTotal: 8,
    startDate: "2026-05-04",
    endDate: "2026-06-28",
    goalDate: "July 4, 2026",
    totalKm: 360,
    generatedAt: "2026-05-04T00:00:00.000Z",
  },
  paceReference: [],
  weeks: [
    {
      index: 0,
      number: 1,
      phase: "Base",
      isDeload: false,
      label: "Base",
      dateRange: "May 4 - May 10",
      totalKm: 45,
      totalDistance: "45 km",
      longRunKm: 14,
      longRunDistance: "14.0 km",
      qualityCount: 1,
      sessions: [
        {
          dayIndex: 1,
          date: "2026-05-04",
          weekdayDate: "Mon, May 4",
          shortDate: "May 4",
          type: "hills",
          label: "Hills",
          role: "quality",
          distance: "6.0 km",
          targetKm: 6,
          pace: "3:57/km",
          hrZone: "Z5",
          rpe: "8",
          description: "Hill repeats, controlled",
          rationale: "Build strength",
          mainSet: "8x60s hills",
          isRest: false,
        },
        {
          dayIndex: 7,
          date: "2026-05-10",
          weekdayDate: "Sun, May 10",
          shortDate: "May 10",
          type: "rest",
          label: "Rest",
          role: "rest",
          distance: "",
          targetKm: null,
          pace: "",
          hrZone: "",
          rpe: "",
          description: "Rest day",
          rationale: "Absorb training",
          mainSet: "",
          isRest: true,
        },
      ],
    },
  ],
  warnings: [],
};

describe("data export renderers", () => {
  test("writes one CSV row per session including rest days", () => {
    const csv = planExportCsvText(MODEL);
    const lines = csv.split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("week_number,week_label");
    expect(lines[1]).toContain('Hills,6,6.0 km,3:57/km');
    expect(lines[2]).toContain("Rest,,,,,,Rest day");
    expect(lines[2].endsWith(",true")).toBe(true);
  });

  test("escapes commas in CSV cells", () => {
    expect(planExportCsvText(MODEL)).toContain('"Hill repeats, controlled"');
  });

  test("writes parseable JSON with export metadata", () => {
    const parsed = JSON.parse(planExportJsonText(MODEL)) as PlanExportModel;

    expect(parsed.title).toBe("10K Training Plan");
    expect(parsed.weeks[0].sessions.at(-1)?.isRest).toBe(true);
  });

  test("writes calendar events for planned sessions", () => {
    const ics = planExportIcsText(MODEL);

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("X-WR-CALNAME:10K Training Plan");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260504");
    expect(ics).toContain("DTEND;VALUE=DATE:20260505");
    expect(ics).toContain("SUMMARY:Pacevo: Hills · 6.0 km");
    expect(ics).toContain("CATEGORIES:Rest");
  });
});
