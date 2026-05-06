import { jsPDF } from "jspdf";
import type { ExportSession, ExportWeek, PlanExportModel } from "../export-model";

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
    `${model.meta.goalRace} | ${model.meta.weeksTotal} weeks`,
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
    .join(" | ");
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
  pdf.text(`${week.dateRange} | ${week.label}`, left + 70, y + 18);
  pdfTextColor(pdf, PDF_COLORS.brand);
  pdf.setFontSize(9);
  pdf.text(`${week.totalDistance} | long ${week.longRunDistance || "-"}`, left + width - 12, y + 18, { align: "right" });
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

export function renderPlanPdf(model: PlanExportModel): jsPDF {
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
    pdfMetricCard(pdf, phaseX, y, phaseWidth, phase, `${summary.weeks} wks | ${summary.km.toFixed(0)} km`);
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

  return pdf;
}
