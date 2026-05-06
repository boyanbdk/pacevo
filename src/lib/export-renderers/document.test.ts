import { describe, expect, test } from "vitest";
import type { PlanExportModel } from "../export-model";
import { renderPlanDocxBlob } from "./docx";
import { renderPlanPdf } from "./pdf";

const MODEL: PlanExportModel = {
  brand: {
    name: "Pacevo",
    label: "PACEVO / PLAN. ADAPT. LEARN.",
    motto: "Plan. Adapt. Learn.",
  },
  title: "10K Training Plan",
  subtitle: "Intermediate - 8 weeks - Goal: July 4, 2026",
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
  paceReference: [
    { key: "tempo", label: "Tempo", value: "4:25/km" },
  ],
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
          type: "tempo",
          label: "Tempo",
          role: "quality",
          distance: "8.0 km",
          targetKm: 8,
          pace: "4:25/km",
          hrZone: "Z4",
          rpe: "7",
          description: "Controlled tempo run",
          rationale: "Build threshold strength.",
          mainSet: "3x8 min tempo",
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
          rationale: "Absorb training.",
          mainSet: "",
          isRest: true,
        },
      ],
    },
  ],
  warnings: ["Keep easy days easy."],
};

describe("document export renderers", () => {
  test("renders a non-empty PDF from the normalized model", () => {
    const pdf = renderPlanPdf(MODEL);
    const bytes = pdf.output("arraybuffer");

    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  test("renders a non-empty DOCX blob from the normalized model", async () => {
    const blob = await renderPlanDocxBlob(MODEL);

    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(blob.size).toBeGreaterThan(1000);
  });
});
