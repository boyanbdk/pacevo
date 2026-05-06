import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
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
  type ExportSession,
  type ExportWeek,
  type PlanExportModel,
  type PlanExportOptions,
} from "./export-model";
import { planExportCsvText, planExportIcsText, planExportJsonText } from "./export-renderers/data";

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

const PDF_PAGE = { width: 595, height: 842, margin: 42 };
const PDF_COLORS = {
  bg: [17, 23, 27] as const,
  panel: [24, 32, 37] as const,
  panelSoft: [21, 28, 32] as const,
  line: [53, 64, 71] as const,
  text: [245, 247, 242] as const,
  muted: [168, 177, 172] as const,
  brand: [216, 255, 0] as const,
  teal: [40, 210, 174] as const,
  white: [255, 255, 255] as const,
};

function pdfFill(pdf: jsPDF, color: readonly number[]) {
  pdf.setFillColor(color[0], color[1], color[2]);
}

function pdfStroke(pdf: jsPDF, color: readonly number[]) {
  pdf.setDrawColor(color[0], color[1], color[2]);
}

function pdfTextColor(pdf: jsPDF, color: readonly number[]) {
  pdf.setTextColor(color[0], color[1], color[2]);
}

function pdfPageShell(pdf: jsPDF, model: PlanExportModel) {
  pdfFill(pdf, PDF_COLORS.bg);
  pdf.rect(0, 0, PDF_PAGE.width, PDF_PAGE.height, "F");
  pdfStroke(pdf, PDF_COLORS.line);
  pdf.setLineWidth(0.5);
  pdf.line(PDF_PAGE.margin, PDF_PAGE.height - 34, PDF_PAGE.width - PDF_PAGE.margin, PDF_PAGE.height - 34);
  pdfTextColor(pdf, PDF_COLORS.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(model.brand.label, PDF_PAGE.margin, PDF_PAGE.height - 20);
  pdf.text(
    `${model.meta.goalRace} · ${model.meta.weeksTotal} weeks`,
    PDF_PAGE.width - PDF_PAGE.margin,
    PDF_PAGE.height - 20,
    { align: "right" },
  );
}

function pdfNewPage(pdf: jsPDF, model: PlanExportModel): number {
  pdf.addPage();
  pdfPageShell(pdf, model);
  return PDF_PAGE.margin;
}

function pdfEnsureSpace(pdf: jsPDF, model: PlanExportModel, y: number, required: number): number {
  if (y + required <= PDF_PAGE.height - 52) return y;
  return pdfNewPage(pdf, model);
}

function pdfSectionTitle(pdf: jsPDF, title: string, y: number): number {
  pdfTextColor(pdf, PDF_COLORS.brand);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text(title.toUpperCase(), PDF_PAGE.margin, y);
  return y + 14;
}

function pdfMetricCard(pdf: jsPDF, x: number, y: number, width: number, label: string, value: string) {
  pdfFill(pdf, PDF_COLORS.panel);
  pdfStroke(pdf, PDF_COLORS.line);
  pdf.roundedRect(x, y, width, 54, 6, 6, "FD");
  pdfTextColor(pdf, PDF_COLORS.muted);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text(label.toUpperCase(), x + 10, y + 17);
  pdfTextColor(pdf, PDF_COLORS.text);
  pdf.setFontSize(13);
  pdf.text(value, x + 10, y + 38, { maxWidth: width - 20 });
}

function pdfPill(pdf: jsPDF, x: number, y: number, label: string, value: string): number {
  const text = `${label}: ${value}`;
  const width = Math.min(pdf.getTextWidth(text) + 18, 150);
  pdfFill(pdf, PDF_COLORS.panelSoft);
  pdfStroke(pdf, PDF_COLORS.line);
  pdf.roundedRect(x, y, width, 20, 5, 5, "FD");
  pdfTextColor(pdf, PDF_COLORS.text);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(text, x + 9, y + 13);
  return width;
}

function pdfSessionDetail(session: ExportSession): string {
  return [session.distance, session.pace, session.hrZone ? `HR ${session.hrZone}` : "", session.rpe ? `RPE ${session.rpe}` : ""]
    .filter(Boolean)
    .join(" · ");
}

function pdfRenderWeek(pdf: jsPDF, model: PlanExportModel, week: ExportWeek, y: number): number {
  const left = PDF_PAGE.margin;
  const width = PDF_PAGE.width - PDF_PAGE.margin * 2;
  const headerH = 28;
  const rowH = 20;
  const weekH = headerH + 20 + week.sessions.length * rowH + 16;
  y = pdfEnsureSpace(pdf, model, y, weekH);

  pdfFill(pdf, PDF_COLORS.panel);
  pdfStroke(pdf, PDF_COLORS.line);
  pdf.roundedRect(left, y, width, headerH, 6, 6, "FD");
  pdfTextColor(pdf, PDF_COLORS.text);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(`Week ${week.number}`, left + 12, y + 18);
  pdfTextColor(pdf, PDF_COLORS.muted);
  pdf.setFontSize(8);
  pdf.text(`${week.dateRange} · ${week.label}`, left + 70, y + 18);
  pdfTextColor(pdf, PDF_COLORS.brand);
  pdf.setFontSize(9);
  pdf.text(`${week.totalDistance} · long ${week.longRunDistance || "-"}`, left + width - 12, y + 18, { align: "right" });
  y += headerH + 10;

  pdfTextColor(pdf, PDF_COLORS.muted);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("DATE", left + 8, y);
  pdf.text("SESSION", left + 94, y);
  pdf.text("TARGET", left + 190, y);
  pdf.text("NOTES", left + 286, y);
  y += 8;

  pdf.setFont("helvetica", "normal");
  for (const [index, session] of week.sessions.entries()) {
    if (index % 2 === 0) {
      pdfFill(pdf, PDF_COLORS.panelSoft);
      pdf.rect(left, y - 6, width, rowH, "F");
    }
    pdfTextColor(pdf, PDF_COLORS.muted);
    pdf.setFontSize(8);
    pdf.text(session.weekdayDate, left + 8, y + 7);
    pdfTextColor(pdf, session.isRest ? PDF_COLORS.muted : PDF_COLORS.teal);
    pdf.setFont("helvetica", "bold");
    pdf.text(session.label, left + 94, y + 7, { maxWidth: 84 });
    pdfTextColor(pdf, PDF_COLORS.text);
    pdf.setFont("helvetica", "normal");
    pdf.text(pdfSessionDetail(session) || "-", left + 190, y + 7, { maxWidth: 84 });
    pdfTextColor(pdf, PDF_COLORS.muted);
    const note = session.isRest ? "Rest and absorb training." : session.description;
    const noteLines = pdf.splitTextToSize(note, 218).slice(0, 1);
    pdf.text(noteLines, left + 286, y + 7);
    y += rowH;
  }

  return y + 14;
}

export function exportPlanPdf(plan: TrainingPlan, options?: PlanExportOptions) {
  const model = buildPlanExportModel(plan, options);
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  pdfPageShell(pdf, model);
  let y = 56;

  pdfTextColor(pdf, PDF_COLORS.brand);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(model.brand.label, PDF_PAGE.margin, y);
  y += 28;

  pdfTextColor(pdf, PDF_COLORS.text);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(30);
  pdf.text(model.title, PDF_PAGE.margin, y);
  y += 24;

  pdfTextColor(pdf, PDF_COLORS.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(model.subtitle, PDF_PAGE.margin, y);
  y += 30;

  const peakWeek = model.weeks.reduce((peak, week) => week.totalKm > peak.totalKm ? week : peak, model.weeks[0]);
  const cardGap = 10;
  const cardWidth = (PDF_PAGE.width - PDF_PAGE.margin * 2 - cardGap * 3) / 4;
  pdfMetricCard(pdf, PDF_PAGE.margin, y, cardWidth, "Date range", `${model.meta.startDate} to ${model.meta.endDate}`);
  pdfMetricCard(pdf, PDF_PAGE.margin + (cardWidth + cardGap), y, cardWidth, "Goal date", model.meta.goalDate);
  pdfMetricCard(pdf, PDF_PAGE.margin + (cardWidth + cardGap) * 2, y, cardWidth, "Total volume", `${model.meta.totalKm.toFixed(0)} km`);
  pdfMetricCard(pdf, PDF_PAGE.margin + (cardWidth + cardGap) * 3, y, cardWidth, "Peak week", peakWeek ? `${peakWeek.totalDistance}` : "-");
  y += 78;

  y = pdfSectionTitle(pdf, "Pace reference", y);
  let pillX = PDF_PAGE.margin;
  for (const item of model.paceReference) {
    const width = pdfPill(pdf, pillX, y, item.label, item.value);
    pillX += width + 8;
    if (pillX > PDF_PAGE.width - PDF_PAGE.margin - 130) {
      pillX = PDF_PAGE.margin;
      y += 26;
    }
  }
  y += 38;

  y = pdfSectionTitle(pdf, "Phase overview", y);
  const phases = new Map<string, { weeks: number; km: number; longRun: number }>();
  for (const week of model.weeks) {
    const current = phases.get(week.phase) ?? { weeks: 0, km: 0, longRun: 0 };
    current.weeks += 1;
    current.km += week.totalKm;
    current.longRun = Math.max(current.longRun, week.longRunKm);
    phases.set(week.phase, current);
  }
  const phaseWidth = (PDF_PAGE.width - PDF_PAGE.margin * 2 - 8 * Math.max(0, phases.size - 1)) / Math.max(1, phases.size);
  let phaseX = PDF_PAGE.margin;
  for (const [phase, summary] of phases) {
    pdfMetricCard(pdf, phaseX, y, phaseWidth, phase, `${summary.weeks} wks · ${summary.km.toFixed(0)} km`);
    pdfTextColor(pdf, PDF_COLORS.muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.text(`Longest run ${summary.longRun.toFixed(1)} km`, phaseX + 10, y + 48, { maxWidth: phaseWidth - 20 });
    phaseX += phaseWidth + 8;
  }
  y += 80;

  if (model.warnings.length > 0) {
    y = pdfSectionTitle(pdf, "Plan notes", y);
    pdfTextColor(pdf, PDF_COLORS.muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    for (const warning of model.warnings) {
      pdf.text(`- ${warning}`, PDF_PAGE.margin, y, { maxWidth: PDF_PAGE.width - PDF_PAGE.margin * 2 });
      y += 13;
    }
    y += 14;
  }

  y = pdfEnsureSpace(pdf, model, y, 80);
  y = pdfSectionTitle(pdf, "Week detail", y);
  for (const week of model.weeks) {
    y = pdfRenderWeek(pdf, model, week, y);
  }

  pdf.save(`${slugify(planGoalLabel(plan.meta.goal_race))}-training-plan.pdf`);
}

const DOCX_COLORS = {
  text: "11171B",
  muted: "5D696F",
  brand: "D8FF00",
  teal: "28D2AE",
  line: "D8DEE2",
  panel: "F4F7F6",
  panelDark: "11171B",
  white: "FFFFFF",
};

const DOCX_BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: DOCX_COLORS.line,
};

function docxText(text: string, options: {
  bold?: boolean;
  italics?: boolean;
  color?: string;
  size?: number;
} = {}) {
  return new TextRun({
    text,
    bold: options.bold,
    italics: options.italics,
    color: options.color ?? DOCX_COLORS.text,
    size: options.size,
  });
}

function docxParagraph(text: string, options: {
  heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
  bold?: boolean;
  color?: string;
  size?: number;
  before?: number;
  after?: number;
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
} = {}) {
  return new Paragraph({
    heading: options.heading,
    alignment: options.alignment,
    children: [docxText(text, {
      bold: options.bold,
      color: options.color,
      size: options.size,
    })],
    spacing: {
      before: options.before,
      after: options.after ?? 120,
    },
  });
}

function docxCell(text: string, options: {
  width?: number;
  bold?: boolean;
  fill?: string;
  color?: string;
  size?: number;
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
} = {}) {
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill } : undefined,
    margins: {
      top: 110,
      bottom: 110,
      left: 120,
      right: 120,
    },
    borders: {
      top: DOCX_BORDER,
      bottom: DOCX_BORDER,
      left: DOCX_BORDER,
      right: DOCX_BORDER,
    },
    children: [
      new Paragraph({
        alignment: options.alignment,
        children: [docxText(text, {
          bold: options.bold,
          color: options.color,
          size: options.size ?? 18,
        })],
      }),
    ],
  });
}

function docxTable(rows: TableRow[]) {
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
  });
}

function docxMetricRow(items: { label: string; value: string }[]) {
  return new TableRow({
    children: items.map((item) =>
      new TableCell({
        width: { size: Math.floor(100 / items.length), type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: DOCX_COLORS.panel },
        margins: { top: 140, bottom: 140, left: 140, right: 140 },
        borders: { top: DOCX_BORDER, bottom: DOCX_BORDER, left: DOCX_BORDER, right: DOCX_BORDER },
        children: [
          new Paragraph({
            children: [docxText(item.label.toUpperCase(), {
              bold: true,
              color: DOCX_COLORS.muted,
              size: 14,
            })],
            spacing: { after: 60 },
          }),
          new Paragraph({
            children: [docxText(item.value, {
              bold: true,
              color: DOCX_COLORS.text,
              size: 22,
            })],
          }),
        ],
      }),
    ),
  });
}

function docxSessionTarget(session: ExportSession): string {
  return [session.distance, session.pace, session.hrZone ? `HR ${session.hrZone}` : "", session.rpe ? `RPE ${session.rpe}` : ""]
    .filter(Boolean)
    .join(" | ") || "-";
}

export async function exportPlanDocx(plan: TrainingPlan, options?: PlanExportOptions) {
  const model = buildPlanExportModel(plan, options);
  const goalLabel = planGoalLabel(plan.meta.goal_race);
  const paceText = model.paceReference.map((item) => `${item.label}: ${item.value}`).join("   ·   ");
  const peakWeek = model.weeks.reduce((peak, week) => week.totalKm > peak.totalKm ? week : peak, model.weeks[0]);

  const children: (Paragraph | Table)[] = [
    docxParagraph(model.brand.label, {
      bold: true,
      color: DOCX_COLORS.teal,
      size: 18,
      after: 80,
    }),
    docxParagraph(model.title, {
      heading: HeadingLevel.TITLE,
      bold: true,
      size: 44,
      after: 80,
    }),
    docxParagraph(model.subtitle, {
      bold: true,
      color: DOCX_COLORS.muted,
      size: 22,
      after: 240,
    }),
    docxTable([
      docxMetricRow([
        { label: "Date range", value: `${model.meta.startDate} to ${model.meta.endDate}` },
        { label: "Goal date", value: model.meta.goalDate },
      ]),
      docxMetricRow([
        { label: "Total volume", value: `${model.meta.totalKm.toFixed(0)} km` },
        { label: "Peak week", value: peakWeek ? `${peakWeek.totalDistance}` : "-" },
      ]),
    ]),
    docxParagraph("Pace Reference", {
      heading: HeadingLevel.HEADING_1,
      bold: true,
      before: 320,
      after: 90,
    }),
    docxParagraph(paceText || "No pace targets available for this plan.", {
      color: DOCX_COLORS.muted,
      after: 220,
    }),
    docxParagraph("Phase Overview", {
      heading: HeadingLevel.HEADING_1,
      bold: true,
      before: 160,
      after: 90,
    }),
  ];

  const phaseRows = new Map<string, { weeks: number; km: number; longRun: number }>();
  for (const week of model.weeks) {
    const current = phaseRows.get(week.phase) ?? { weeks: 0, km: 0, longRun: 0 };
    current.weeks += 1;
    current.km += week.totalKm;
    current.longRun = Math.max(current.longRun, week.longRunKm);
    phaseRows.set(week.phase, current);
  }

  children.push(docxTable([
    new TableRow({
      tableHeader: true,
      children: [
        docxCell("Phase", { bold: true, fill: DOCX_COLORS.panelDark, color: DOCX_COLORS.white, width: 25 }),
        docxCell("Weeks", { bold: true, fill: DOCX_COLORS.panelDark, color: DOCX_COLORS.white, width: 20 }),
        docxCell("Volume", { bold: true, fill: DOCX_COLORS.panelDark, color: DOCX_COLORS.white, width: 25 }),
        docxCell("Longest run", { bold: true, fill: DOCX_COLORS.panelDark, color: DOCX_COLORS.white, width: 30 }),
      ],
    }),
    ...[...phaseRows.entries()].map(([phase, summary]) =>
      new TableRow({
        children: [
          docxCell(phase, { bold: true, width: 25 }),
          docxCell(`${summary.weeks}`, { width: 20 }),
          docxCell(`${summary.km.toFixed(0)} km`, { width: 25 }),
          docxCell(`${summary.longRun.toFixed(1)} km`, { width: 30 }),
        ],
      }),
    ),
  ]));

  if (model.warnings.length > 0) {
    children.push(
      docxParagraph("Plan Notes", {
        heading: HeadingLevel.HEADING_1,
        bold: true,
        before: 320,
        after: 90,
      }),
      ...model.warnings.map((warning) => docxParagraph(`- ${warning}`, {
        color: DOCX_COLORS.muted,
        after: 60,
      })),
    );
  }

  children.push(docxParagraph("Week Detail", {
    heading: HeadingLevel.HEADING_1,
    bold: true,
    before: 360,
    after: 120,
  }));

  for (const week of model.weeks) {
    children.push(
      docxParagraph(`Week ${week.number} - ${week.dateRange}`, {
        heading: HeadingLevel.HEADING_2,
        bold: true,
        before: 220,
        after: 40,
      }),
      docxParagraph(`${week.label} | ${week.totalDistance} | Long ${week.longRunDistance || "-"}`, {
        color: DOCX_COLORS.muted,
        size: 18,
        after: 80,
      }),
    );

    const rows = [
      new TableRow({
        tableHeader: true,
        children: [
          docxCell("Date", { bold: true, fill: DOCX_COLORS.panelDark, color: DOCX_COLORS.white, width: 18 }),
          docxCell("Session", { bold: true, fill: DOCX_COLORS.panelDark, color: DOCX_COLORS.white, width: 18 }),
          docxCell("Target", { bold: true, fill: DOCX_COLORS.panelDark, color: DOCX_COLORS.white, width: 22 }),
          docxCell("Notes", { bold: true, fill: DOCX_COLORS.panelDark, color: DOCX_COLORS.white, width: 42 }),
        ],
      }),
      ...week.sessions.map(
        (session) =>
          new TableRow({
            children: [
              docxCell(session.weekdayDate, { width: 18, color: DOCX_COLORS.muted }),
              docxCell(session.label, { width: 18, bold: !session.isRest, color: session.isRest ? DOCX_COLORS.muted : DOCX_COLORS.text }),
              docxCell(docxSessionTarget(session), { width: 22 }),
              docxCell(session.isRest ? "Rest and absorb training." : session.description, { width: 42, color: DOCX_COLORS.muted }),
            ],
          }),
      ),
    ];

    children.push(docxTable(rows));
  }

  const doc = new Document({
    title: model.title,
    description: `${model.title} exported from ${model.brand.name}`,
    creator: model.brand.name,
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: { font: "Helvetica", size: 20, color: DOCX_COLORS.text },
          paragraph: { spacing: { after: 120 } },
        },
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Helvetica", size: 44, bold: true, color: DOCX_COLORS.text },
          paragraph: { spacing: { after: 80 } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Helvetica", size: 26, bold: true, color: DOCX_COLORS.text },
          paragraph: { spacing: { before: 260, after: 100 } },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Helvetica", size: 22, bold: true, color: DOCX_COLORS.text },
          paragraph: { spacing: { before: 220, after: 60 } },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.7),
            right: convertInchesToTwip(0.65),
            bottom: convertInchesToTwip(0.7),
            left: convertInchesToTwip(0.65),
          },
        },
      },
      children,
    }],
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

export function exportPlanIcs(plan: TrainingPlan, options?: PlanExportOptions) {
  const model = buildPlanExportModel(plan, options);
  downloadText(
    planExportIcsText(model),
    `${slugify(planGoalLabel(plan.meta.goal_race))}-training-plan.ics`,
    "text/calendar;charset=utf-8",
  );
}

export type PlanWeekImagePreset = "landscape" | "square" | "story" | "print";

const WEEK_IMAGE_PRESETS: Record<PlanWeekImagePreset, {
  width: number;
  height: number;
  columns: number;
  padding: number;
}> = {
  landscape: { width: 1600, height: 900, columns: 7, padding: 48 },
  square: { width: 1200, height: 1200, columns: 2, padding: 44 },
  story: { width: 1080, height: 1920, columns: 1, padding: 54 },
  print: { width: 2400, height: 1600, columns: 7, padding: 72 },
};

const SESSION_EXPORT_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  easy: { border: "#28d2ae", bg: "rgba(40, 210, 174, 0.13)", text: "#28d2ae" },
  long: { border: "#d8ff00", bg: "rgba(216, 255, 0, 0.13)", text: "#d8ff00" },
  tempo: { border: "#ff9f43", bg: "rgba(255, 159, 67, 0.13)", text: "#ffb66b" },
  interval: { border: "#ff6b6b", bg: "rgba(255, 107, 107, 0.13)", text: "#ff8a8a" },
  repetition: { border: "#ff6b6b", bg: "rgba(255, 107, 107, 0.13)", text: "#ff8a8a" },
  marathon_pace: { border: "#a29bfe", bg: "rgba(162, 155, 254, 0.13)", text: "#bbb6ff" },
  recovery: { border: "#74b9ff", bg: "rgba(116, 185, 255, 0.13)", text: "#9dcbff" },
  strides: { border: "#fd79a8", bg: "rgba(253, 121, 168, 0.13)", text: "#ff9dc1" },
  fartlek: { border: "#fdcb6e", bg: "rgba(253, 203, 110, 0.13)", text: "#ffdc95" },
  hills: { border: "#e17055", bg: "rgba(225, 112, 85, 0.13)", text: "#ff8c72" },
  cross: { border: "#6c5ce7", bg: "rgba(108, 92, 231, 0.13)", text: "#9b90ff" },
  race: { border: "#ffd700", bg: "rgba(255, 215, 0, 0.14)", text: "#ffe36b" },
  rest: { border: "#334047", bg: "rgba(255, 255, 255, 0.035)", text: "#a8b1ac" },
};

const EXPORT_DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function applyStyles<T extends HTMLElement>(node: T, styles: Partial<CSSStyleDeclaration>): T {
  Object.assign(node.style, styles);
  return node;
}

function textNode(tag: keyof HTMLElementTagNameMap, text: string, styles: Partial<CSSStyleDeclaration> = {}) {
  const node = document.createElement(tag);
  node.textContent = text;
  return applyStyles(node, styles);
}

export async function exportPlanWeekCardImage(
  plan: TrainingPlan,
  weekIndex: number,
  options?: PlanExportOptions,
  preset: PlanWeekImagePreset = "landscape",
) {
  const model = buildPlanExportModel(plan, options);
  const week = model.weeks[weekIndex];
  if (!week) return;

  const config = WEEK_IMAGE_PRESETS[preset];
  const isTall = config.columns === 1;
  const isWide = config.columns === 7;
  const node = applyStyles(document.createElement("div"), {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${config.width}px`,
    height: `${config.height}px`,
    boxSizing: "border-box",
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    gap: isTall ? "34px" : "28px",
    padding: `${config.padding}px`,
    overflow: "hidden",
    background: "#11171b",
    border: "2px solid rgba(40, 210, 174, 0.55)",
    borderRadius: "20px",
    color: "#f5f7f2",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    letterSpacing: "0",
  });

  const header = applyStyles(document.createElement("header"), {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: "28px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
    paddingBottom: isTall ? "28px" : "22px",
  });

  const headerMain = applyStyles(document.createElement("div"), { display: "grid", gap: "12px" });
  headerMain.append(
    textNode("div", model.brand.label, {
      color: "#d8ff00",
      fontSize: isTall ? "28px" : "24px",
      fontWeight: "900",
    }),
    textNode("div", week.label.toUpperCase(), {
      color: "#d8ff00",
      fontSize: isTall ? "34px" : "30px",
      fontWeight: "900",
    }),
    textNode("h1", `Week ${week.number} · ${week.dateRange} · ${week.totalDistance}`, {
      margin: "0",
      color: "#f5f7f2",
      fontSize: isTall ? "54px" : isWide ? "46px" : "48px",
      lineHeight: "1.05",
      fontWeight: "900",
    }),
  );

  const meta = applyStyles(document.createElement("div"), {
    display: "grid",
    justifyItems: "end",
    gap: "8px",
    color: "#a8b1ac",
    fontSize: isTall ? "24px" : "20px",
    fontWeight: "800",
    whiteSpace: "nowrap",
  });
  meta.append(
    textNode("span", model.meta.goalRace),
    textNode("span", `${model.meta.level} · ${model.meta.weeksTotal} weeks`),
  );

  header.append(headerMain, meta);
  node.append(header);

  const grid = applyStyles(document.createElement("main"), {
    display: "grid",
    gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`,
    gap: isTall ? "18px" : "16px",
    alignContent: "stretch",
    minHeight: "0",
  });

  for (const session of [...week.sessions].sort((a, b) => a.dayIndex - b.dayIndex)) {
    const colors = SESSION_EXPORT_COLORS[session.type] ?? SESSION_EXPORT_COLORS.rest;
    const card = applyStyles(document.createElement("section"), {
      display: "grid",
      gridTemplateRows: "auto 1fr auto",
      gap: isTall ? "12px" : "18px",
      minWidth: "0",
      minHeight: "0",
      padding: isTall ? "20px 24px" : "22px",
      border: `2px solid ${colors.border}`,
      borderRadius: "18px",
      background: colors.bg,
      boxSizing: "border-box",
      overflow: "hidden",
    });

    const day = applyStyles(document.createElement("div"), {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: "12px",
      color: "#a8b1ac",
      fontSize: isTall ? "24px" : "22px",
      fontWeight: "900",
    });
    day.append(
      textNode("span", EXPORT_DAY_LABELS[session.dayIndex - 1] ?? "DAY"),
      textNode("span", session.shortDate, { color: "#f5f7f2", whiteSpace: "nowrap" }),
    );

    const body = applyStyles(document.createElement("div"), {
      display: "grid",
      alignContent: "start",
      gap: isTall ? "10px" : "18px",
      minWidth: "0",
    });
    body.append(
      textNode("strong", session.label, {
        color: colors.text,
        fontSize: isTall ? "34px" : isWide ? "28px" : "32px",
        lineHeight: "1.05",
        fontWeight: "900",
        overflowWrap: "anywhere",
      }),
    );
    if (session.distance) {
      body.append(textNode("span", session.distance, {
        color: "#a8b1ac",
        fontSize: isTall ? "28px" : "25px",
        fontWeight: "750",
      }));
    }
    if (session.pace) {
      body.append(textNode("span", session.pace, {
        color: "#f5f7f2",
        fontSize: isTall ? "22px" : "18px",
        fontWeight: "750",
      }));
    }

    const footer = textNode("p", session.isRest ? "Rest" : session.description, {
      margin: "0",
      color: "#a8b1ac",
      fontSize: isTall ? "20px" : "15px",
      lineHeight: "1.35",
      overflow: "hidden",
    });

    card.append(day, body, footer);
    grid.append(card);
  }

  node.append(grid);

  const footer = applyStyles(document.createElement("footer"), {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    color: "#a8b1ac",
    fontSize: isTall ? "20px" : "16px",
    fontWeight: "700",
  });
  footer.append(
    textNode("span", model.brand.motto),
    textNode("span", `${week.phase} · ${week.totalDistance} · Long ${week.longRunDistance || "-"}`),
  );
  node.append(footer);

  document.body.appendChild(node);
  try {
    const dataUrl = await toPng(node, {
      cacheBust: true,
      pixelRatio: 1,
      backgroundColor: "#11171b",
      width: config.width,
      height: config.height,
    });
    const response = await fetch(dataUrl);
    downloadBlob(await response.blob(), `${slugify(model.meta.goalRace)}-week-${week.number}-${preset}.png`);
  } finally {
    node.remove();
  }
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
