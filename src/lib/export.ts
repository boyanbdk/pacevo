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
import type { AdjustedWorkout } from "@/domain/workout-schema";
import type { TrainingPlan } from "@/domain/training-plan/types";
import { formatPlanDate, formatWeekRange, formatWeekdayDate } from "@/lib/plan-dates";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workout";
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
  pdf.text(`RUN TAILOR / ${workout.lane.toUpperCase()}`, margin, y);
  y += 28;

  pdf.setTextColor(245, 247, 242);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  workout.steps.forEach((step, index) => {
    const lines = pdf.splitTextToSize(`${index + 1}. ${step.kind} - ${step.target}`, 500);
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

const PLAN_SESSION_LABELS: Record<string, string> = {
  easy: "Easy",
  long: "Long run",
  tempo: "Tempo",
  interval: "Intervals",
  repetition: "Reps",
  marathon_pace: "MP",
  recovery: "Recovery",
  strides: "Strides",
  fartlek: "Fartlek",
  hills: "Hills",
  cross: "Cross-training",
  rest: "Rest",
};

const PLAN_PHASE_LABELS: Record<string, string> = {
  base: "Base",
  build: "Build",
  peak: "Peak",
  taper: "Taper",
};

const PLAN_GOAL_LABELS: Record<string, string> = {
  "5K": "5K",
  "10K": "10K",
  half: "Half Marathon",
  marathon: "Marathon",
};

function fmtPace(s: number | null): string {
  if (s === null) return "—";
  const min = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${min}:${sec.toString().padStart(2, "0")}/km`;
}

export function exportPlanPdf(plan: TrainingPlan) {
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
  pdf.text(`${PLAN_GOAL_LABELS[plan.meta.goal_race] ?? plan.meta.goal_race} Training Plan`, margin, y);
  y += 24;

  // Subtitle
  pdf.setTextColor(201, 255, 64);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const goalDate = formatPlanDate(plan.meta.goal_date, {
    month: "long", day: "numeric", year: "numeric",
  });
  pdf.text(
    `${plan.meta.level.toUpperCase()} · ${plan.meta.weeks_total} WEEKS · GOAL: ${goalDate}`,
    margin,
    y,
  );
  y += 26;

  // Pace reference line
  pdf.setTextColor(200, 200, 200);
  pdf.setFontSize(9);
  const paceItems = [
    `Easy: ${fmtPace(plan.paces.E_low)}–${fmtPace(plan.paces.E_high)}`,
    plan.paces.T ? `Tempo: ${fmtPace(plan.paces.T)}` : null,
    plan.paces.I ? `Intervals: ${fmtPace(plan.paces.I)}` : null,
    plan.paces.M ? `MP: ${fmtPace(plan.paces.M)}` : null,
  ].filter(Boolean).join("   ·   ");
  pdf.text(paceItems, margin, y);
  y += 24;

  // Weeks
  for (const week of plan.weeks) {
    const runningSessions = week.sessions.filter((s) => s.type !== "rest");
    const weekHeight = 18 + runningSessions.length * 13 + 10;
    if (y + weekHeight > pageHeight - 44) {
      newPage();
    }

    // Week header
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(245, 247, 242);
    const deloadLabel = week.is_deload ? " · Deload" : "";
    pdf.text(
      `Week ${week.week_index + 1}  -  ${formatWeekRange(week)}  -  ${PLAN_PHASE_LABELS[week.phase]}${deloadLabel}  ·  ${week.total_km.toFixed(0)} km`,
      margin,
      y,
    );
    y += 14;

    // Sessions
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(180, 180, 180);
    for (const session of runningSessions) {
      const distStr = session.target_km ? `${session.target_km.toFixed(1)} km` : "";
      const paceStr = session.pace_low_s_km ? fmtPace(session.pace_low_s_km) : "";
      const detail = [distStr, paceStr].filter(Boolean).join(" · ");
      const label = PLAN_SESSION_LABELS[session.type] ?? session.type;
      const line = `  ${formatWeekdayDate(session.date)}   ${label}${detail ? "   " + detail : ""}`;
      pdf.text(line, margin, y);
      y += 12;
    }
    y += 8;
  }

  pdf.save(`${slugify(PLAN_GOAL_LABELS[plan.meta.goal_race] ?? "plan")}-training-plan.pdf`);
}

export async function exportPlanDocx(plan: TrainingPlan) {
  const goalLabel = PLAN_GOAL_LABELS[plan.meta.goal_race] ?? plan.meta.goal_race;
  const goalDate = formatPlanDate(plan.meta.goal_date, {
    month: "long", day: "numeric", year: "numeric",
  });

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: `${goalLabel} Training Plan`,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${plan.meta.level.charAt(0).toUpperCase() + plan.meta.level.slice(1)} · ${plan.meta.weeks_total} weeks · Goal: ${goalDate}`,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Paces — Easy: ${fmtPace(plan.paces.E_low)}–${fmtPace(plan.paces.E_high)}` +
            (plan.paces.T ? `  |  Tempo: ${fmtPace(plan.paces.T)}` : "") +
            (plan.paces.I ? `  |  Intervals: ${fmtPace(plan.paces.I)}` : "") +
            (plan.paces.M ? `  |  MP: ${fmtPace(plan.paces.M)}` : ""),
        }),
      ],
      spacing: { after: 300 },
    }),
  ];

  for (const week of plan.weeks) {
    const deloadLabel = week.is_deload ? " (Deload)" : "";
    children.push(
      new Paragraph({
        text: `Week ${week.week_index + 1} - ${formatWeekRange(week)} - ${PLAN_PHASE_LABELS[week.phase]}${deloadLabel}   ${week.total_km.toFixed(0)} km`,
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
      ...week.sessions
        .filter((s) => s.type !== "rest")
        .map(
          (session) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(formatWeekdayDate(session.date))] }),
                new TableCell({ children: [new Paragraph(PLAN_SESSION_LABELS[session.type] ?? session.type)] }),
                new TableCell({ children: [new Paragraph(session.target_km ? `${session.target_km.toFixed(1)} km` : "—")] }),
                new TableCell({ children: [new Paragraph(session.pace_low_s_km ? fmtPace(session.pace_low_s_km) : "—")] }),
                new TableCell({ children: [new Paragraph(session.description ?? "")] }),
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

export async function exportPlanWeekImage(node: HTMLElement, goalRace: string, weekIndex: number) {
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#171d21",
  });
  const response = await fetch(dataUrl);
  downloadBlob(await response.blob(), `${slugify(goalRace)}-week-${weekIndex + 1}.png`);
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
            children: [new TextRun({ text: `Run Tailor / ${workout.lane}`, bold: true })]
          }),
          ...workout.steps.map(
            (step, index) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${index + 1}. ${step.kind}: ${step.target}`,
                    bold: step.kind !== "Recovery"
                  }),
                  new TextRun({ text: `  ${step.detail}` })
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
