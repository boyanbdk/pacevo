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
