import type { PlanExportModel } from "../export-model";

const CSV_HEADERS = [
  "week_number",
  "week_label",
  "week_date_range",
  "day_index",
  "date",
  "session",
  "distance_km",
  "distance",
  "pace",
  "hr_zone",
  "rpe",
  "description",
  "rationale",
  "main_set",
  "is_rest",
] as const;

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export function planExportCsvText(model: PlanExportModel): string {
  const rows = model.weeks.flatMap((week) =>
    week.sessions.map((session) => [
      week.number,
      week.label,
      week.dateRange,
      session.dayIndex,
      session.date,
      session.label,
      session.targetKm,
      session.distance,
      session.pace,
      session.hrZone,
      session.rpe,
      session.description,
      session.rationale,
      session.mainSet,
      session.isRest,
    ]),
  );

  return [
    CSV_HEADERS.join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");
}

export function planExportJsonText(model: PlanExportModel): string {
  return JSON.stringify(model, null, 2);
}
