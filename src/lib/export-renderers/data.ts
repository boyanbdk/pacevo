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

function icsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/g, "\\n");
}

function icsDate(value: string): string {
  return value.replaceAll("-", "");
}

function nextIcsDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function icsTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "19700101T000000Z";
  return date.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function planExportIcsText(model: PlanExportModel): string {
  const stamp = icsTimestamp(model.meta.generatedAt);
  const events = model.weeks.flatMap((week) =>
    week.sessions.map((session) => {
      const target = [session.distance, session.pace, session.hrZone ? `HR ${session.hrZone}` : "", session.rpe ? `RPE ${session.rpe}` : ""]
        .filter(Boolean)
        .join(" | ");
      const description = [
        session.description,
        target ? `Target: ${target}` : null,
        session.mainSet ? `Main set: ${session.mainSet}` : null,
        session.rationale ? `Why: ${session.rationale}` : null,
        `${model.brand.name} ${model.meta.goalRace} plan, week ${week.number}`,
      ].filter(Boolean).join("\n");

      return [
        "BEGIN:VEVENT",
        `UID:${icsText(`${model.meta.goalRace}-week-${week.number}-day-${session.dayIndex}-${session.date}@pacevo`)}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(session.date)}`,
        `DTEND;VALUE=DATE:${nextIcsDate(session.date)}`,
        `SUMMARY:${icsText(`${model.brand.name}: ${session.label}${session.distance ? ` · ${session.distance}` : ""}`)}`,
        `DESCRIPTION:${icsText(description)}`,
        `CATEGORIES:${icsText(session.isRest ? "Rest" : "Training")}`,
        "END:VEVENT",
      ].join("\r\n");
    }),
  );

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pacevo//Training Plan Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(model.title)}`,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}
