import type { TrainingWeek } from "@/domain/training-plan/types";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parsePlanDate(value: string): Date {
  const match = value.match(DATE_RE);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatPlanDate(value: string, options: Intl.DateTimeFormatOptions): string {
  return parsePlanDate(value).toLocaleDateString("en-US", options);
}

export function formatShortPlanDate(value: string): string {
  return formatPlanDate(value, { month: "short", day: "numeric" });
}

export function formatFullPlanDate(value: string): string {
  return formatPlanDate(value, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatWeekdayDate(value: string): string {
  return formatPlanDate(value, { weekday: "short", month: "short", day: "numeric" });
}

export function formatWeekRange(week: TrainingWeek): string {
  const first = week.sessions[0]?.date;
  const last = week.sessions.at(-1)?.date;
  if (!first || !last) return "";
  return `${formatShortPlanDate(first)} - ${formatShortPlanDate(last)}`;
}
