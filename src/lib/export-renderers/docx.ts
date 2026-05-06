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
import type { ExportSession, PlanExportModel } from "../export-model";

const DOCX_COLORS = {
  text: "11171B",
  muted: "5D696F",
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

export async function renderPlanDocxBlob(model: PlanExportModel): Promise<Blob> {
  const paceText = model.paceReference.map((item) => `${item.label}: ${item.value}`).join("   |   ");
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

  return Packer.toBlob(doc);
}
