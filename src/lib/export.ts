import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { groupAdjustedSteps } from "../domain/run-tailor";
import type { AdjustedWorkout } from "../domain/workout-schema";
import type { AdjustedStepGroup } from "../domain/workout-schema";
import type { TrainingPlan } from "../domain/training-plan/types";
import { BRAND_MOTTO, BRAND_NAME } from "./brand";
import {
  buildPlanExportModel,
  planGoalLabel,
  planPaceReferenceText,
  sessionPaceForExport as modelSessionPaceForExport,
  type PlanExportOptions,
} from "./export-model";
import { planExportCsvText, planExportJsonText } from "./export-renderers/data";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadText(text: string, filename: string, type: string) {
  downloadBlob(new Blob([text], { type }), filename);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workout";
}

function workoutStepGroups(workout: AdjustedWorkout): AdjustedStepGroup[] {
  return workout.stepGroups ?? groupAdjustedSteps(workout.steps);
}

function formatWorkoutGroup(group: AdjustedStepGroup, index: number): string {
  if (group.type === "single") {
    return `${index + 1}. ${group.step.kind} - ${group.step.target}`;
  }
  return `${index + 1}. Repeat ${group.reps}x - ${repeatTarget(group)}; recovery ${group.rest.target}`;
}

function formatWorkoutGroupDetail(group: AdjustedStepGroup): string {
  if (group.type === "single") return group.step.detail;
  const targets = new Set(group.runs.map((run) => run.target));
  const targetNote = targets.size === 1 ? group.run.detail : "Targets vary by rep.";
  return `${targetNote} Recovery between reps: ${group.rest.detail}`;
}

function repeatTarget(group: Extract<AdjustedStepGroup, { type: "repeat" }>): string {
  const targets = new Set(group.runs.map((run) => run.target));
  if (targets.size === 1) return group.run.target;
  const paces = [...new Set(group.runs.map((run) => run.pace).filter(Boolean))];
  const speeds = group.runs
    .map((run) => run.speedKmh)
    .filter((speed): speed is number => speed !== undefined);
  const distance = group.run.distanceLabel ?? "Rep";
  if (paces.length > 0 && speeds.length > 0) {
    return `${distance} reps at ${paces.at(-1)}-${paces[0]}/km (${Math.min(...speeds).toFixed(1)}-${Math.max(...speeds).toFixed(1)} km/h)`;
  }
  return `${distance} reps with varied targets`;
}

export async function exportCardImage(node: HTMLElement, title: string) {
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#171d21"
  });
  const response = await fetch(dataUrl);
  downloadBlob(await response.blob(), `${slugify(title)}.png`);
}

export function exportWorkoutPdf(workout: AdjustedWorkout) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 44;
  let y = 54;

  pdf.setFillColor(17, 20, 23);
  pdf.rect(0, 0, 595, 842, "F");
  pdf.setTextColor(245, 247, 242);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.text(workout.title, margin, y);
  y += 28;
  pdf.setTextColor(201, 255, 64);
  pdf.setFontSize(11);
  pdf.text(`${BRAND_NAME.toUpperCase()} / ${workout.lane.toUpperCase()}`, margin, y);
  y += 15;
  pdf.setTextColor(156, 166, 147);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(BRAND_MOTTO, margin, y);
  y += 28;

  pdf.setTextColor(245, 247, 242);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  workoutStepGroups(workout).forEach((group, index) => {
    const lines = pdf.splitTextToSize(formatWorkoutGroup(group, index), 500);
    if (y + lines.length * 14 > 800) {
      pdf.addPage();
      pdf.setFillColor(17, 20, 23);
      pdf.rect(0, 0, 595, 842, "F");
      pdf.setTextColor(245, 247, 242);
      y = 54;
    }
    pdf.text(lines, margin, y);
    y += lines.length * 14 + 7;
  });

  pdf.save(`${slugify(workout.title)}.pdf`);
}

// ---------------------------------------------------------------------------
// Training plan exports
// ---------------------------------------------------------------------------

export function planPaceReference(plan: TrainingPlan, options?: PlanExportOptions): string {
  return planPaceReferenceText(plan, options);
}

export const sessionPaceForExport = modelSessionPaceForExport;

export function exportPlanPdf(plan: TrainingPlan, options?: PlanExportOptions) {
  const model = buildPlanExportModel(plan, options);
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 44;
  const pageWidth = 595;
  const pageHeight = 842;
  let y = 54;

  function newPage() {
    pdf.addPage();
    pdf.setFillColor(17, 20, 23);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    pdf.setTextColor(245, 247, 242);
    y = 54;
  }

  // Background
  pdf.setFillColor(17, 20, 23);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");

  // Title
  pdf.setTextColor(245, 247, 242);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text(model.title, margin, y);
  y += 18;

  // Brand line
  pdf.setTextColor(201, 255, 64);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(model.brand.label, margin, y);
  y += 20;

  // Subtitle
  pdf.setTextColor(200, 200, 200);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(model.subtitle.toUpperCase(), margin, y);
  y += 26;

  // Pace reference line
  pdf.setTextColor(200, 200, 200);
  pdf.setFontSize(9);
  const paceItems = planPaceReferenceText(plan, options);
  pdf.text(paceItems, margin, y);
  y += 24;

  // Weeks
  for (const week of model.weeks) {
    const weekHeight = 18 + week.sessions.length * 13 + 10;
    if (y + weekHeight > pageHeight - 44) {
      newPage();
    }

    // Week header
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(245, 247, 242);
    pdf.text(
      `Week ${week.number}  -  ${week.dateRange}  -  ${week.label}  ·  ${week.totalDistance}`,
      margin,
      y,
    );
    y += 14;

    // Sessions
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(180, 180, 180);
    for (const session of week.sessions) {
      const detail = [session.distance, session.pace].filter(Boolean).join(" · ");
      const line = `  ${session.weekdayDate}   ${session.label}${detail ? "   " + detail : ""}`;
      pdf.text(line, margin, y);
      y += 12;
    }
    y += 8;
  }

  pdf.save(`${slugify(planGoalLabel(plan.meta.goal_race))}-training-plan.pdf`);
}

export async function exportPlanDocx(plan: TrainingPlan, options?: PlanExportOptions) {
  const model = buildPlanExportModel(plan, options);
  const goalLabel = planGoalLabel(plan.meta.goal_race);
  const paceText = model.paceReference.map((item) => `${item.label}: ${item.value}`).join("   ·   ");

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: model.title,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: model.brand.label,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: model.subtitle,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Paces - ${paceText}`,
        }),
      ],
      spacing: { after: 300 },
    }),
  ];

  for (const week of model.weeks) {
    children.push(
      new Paragraph({
        text: `Week ${week.number} - ${week.dateRange} - ${week.label}   ${week.totalDistance}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240 },
      }),
    );

    const rows = [
      new TableRow({
        tableHeader: true,
        children: ["Date", "Session", "Distance", "Pace", "Notes"].map(
          (text) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
              width: { size: 20, type: WidthType.PERCENTAGE },
            }),
        ),
      }),
      ...week.sessions.map(
        (session) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(session.weekdayDate)] }),
              new TableCell({ children: [new Paragraph(session.label)] }),
              new TableCell({ children: [new Paragraph(session.distance || "-")] }),
              new TableCell({ children: [new Paragraph(session.pace || "-")] }),
              new TableCell({ children: [new Paragraph(session.description)] }),
            ],
          }),
      ),
    ];

    children.push(
      new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      }),
    );
  }

  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: { font: "Helvetica", size: 20 },
        },
      ],
    },
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${slugify(goalLabel)}-training-plan.docx`);
}

export function exportPlanCsv(plan: TrainingPlan, options?: PlanExportOptions) {
  const model = buildPlanExportModel(plan, options);
  downloadText(
    planExportCsvText(model),
    `${slugify(planGoalLabel(plan.meta.goal_race))}-training-plan.csv`,
    "text/csv;charset=utf-8",
  );
}

export function exportPlanJson(plan: TrainingPlan, options?: PlanExportOptions) {
  const model = buildPlanExportModel(plan, options);
  downloadText(
    planExportJsonText(model),
    `${slugify(planGoalLabel(plan.meta.goal_race))}-training-plan.json`,
    "application/json;charset=utf-8",
  );
}

export async function exportPlanWeekImage(node: HTMLElement, goalRace: string, weekIndex: number) {
  node.dataset.exporting = "true";
  try {
    const dataUrl = await toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#171d21",
    });
    const response = await fetch(dataUrl);
    downloadBlob(await response.blob(), `${slugify(goalRace)}-week-${weekIndex + 1}.png`);
  } finally {
    delete node.dataset.exporting;
  }
}

export async function exportWorkoutDocx(workout: AdjustedWorkout) {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: workout.title, bold: true, size: 36 })]
          }),
          new Paragraph({
            children: [new TextRun({ text: `${BRAND_NAME} / ${workout.lane}`, bold: true })]
          }),
          new Paragraph({
            children: [new TextRun({ text: BRAND_MOTTO, italics: true, color: "6B7566", size: 18 })],
            spacing: { after: 240 },
          }),
          ...workoutStepGroups(workout).map(
            (group, index) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: formatWorkoutGroup(group, index),
                    bold: group.type === "repeat" || group.step.kind !== "Recovery"
                  }),
                  new TextRun({ text: `  ${formatWorkoutGroupDetail(group)}` })
                ]
              })
          ),
          new Paragraph({
            children: [new TextRun({ text: workout.notes.join(" "), italics: true })]
          })
        ]
      }
    ]
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${slugify(workout.title)}.docx`);
}
