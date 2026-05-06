import type { UserSettings } from "@/domain/workout-schema";
import type { PlannedSession, TrainingPlan } from "@/domain/training-plan/types";
import { BRAND_EXPORT_LABEL, BRAND_MOTTO, BRAND_NAME } from "./brand";
import {
  formatPlanDate,
  formatShortPlanDate,
  formatWeekRange,
  formatWeekdayDate,
} from "./plan-dates";

export type ExportFormat = "png" | "pdf" | "docx" | "csv" | "json" | "ics";

export type PlanExportOptions = Partial<Pick<
  UserSettings,
  "defaultEasyPace" | "defaultCooldownPace" | "showEasyRunPaceTargets"
>> & {
  weekStartIndex?: number;
  weekEndIndex?: number;
  includeRestDays?: boolean;
  includePaces?: boolean;
  includeHrZones?: boolean;
  includeRationale?: boolean;
  includeWarnings?: boolean;
};

export type ExportPaceItem = {
  key: string;
  label: string;
  value: string;
};

export type ExportSession = {
  dayIndex: number;
  date: string;
  weekdayDate: string;
  shortDate: string;
  type: string;
  label: string;
  role: string;
  distance: string;
  targetKm: number | null;
  pace: string;
  hrZone: string;
  rpe: string;
  description: string;
  rationale: string;
  mainSet: string;
  isRest: boolean;
};

export type ExportWeek = {
  index: number;
  number: number;
  phase: string;
  isDeload: boolean;
  label: string;
  dateRange: string;
  totalKm: number;
  totalDistance: string;
  longRunKm: number;
  longRunDistance: string;
  qualityCount: number;
  sessions: ExportSession[];
};

export type PlanExportModel = {
  brand: {
    name: string;
    label: string;
    motto: string;
  };
  title: string;
  subtitle: string;
  meta: {
    goalRace: string;
    level: string;
    weeksTotal: number;
    startDate: string;
    endDate: string;
    goalDate: string;
    totalKm: number;
    generatedAt: string;
  };
  paceReference: ExportPaceItem[];
  weeks: ExportWeek[];
  warnings: string[];
};

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
  race: "Race day",
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

const EASY_PACE_OPTIONAL_TYPES = new Set(["easy", "recovery"]);

export function planGoalLabel(goalRace: string): string {
  return PLAN_GOAL_LABELS[goalRace] ?? goalRace;
}

export function planPhaseLabel(phase: string): string {
  return PLAN_PHASE_LABELS[phase] ?? phase;
}

export function planSessionLabel(type: string): string {
  return PLAN_SESSION_LABELS[type] ?? type;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function fmtPace(s: number | null): string {
  if (s === null) return "";
  const min = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${min}:${sec.toString().padStart(2, "0")}/km`;
}

function fmtDistance(km: number | null): string {
  if (km === null || km === 0) return "";
  return `${km.toFixed(1)} km`;
}

function fmtNumber(value: number | null): string {
  if (value === null) return "";
  return String(value);
}

function fmtSettingPace(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.includes("/") ? trimmed : `${trimmed}/km`;
}

export function sessionPaceForExport(session: PlannedSession, options?: PlanExportOptions): string {
  if (options?.includePaces === false) return "";
  if (EASY_PACE_OPTIONAL_TYPES.has(session.type)) {
    if (options?.showEasyRunPaceTargets !== true) return "";
    const setting = session.type === "recovery" ? options.defaultCooldownPace : options.defaultEasyPace;
    return fmtSettingPace(setting);
  }
  return fmtPace(session.pace_low_s_km);
}

export function buildPaceReference(plan: TrainingPlan, options?: PlanExportOptions): ExportPaceItem[] {
  if (options?.includePaces === false) return [];
  return [
    fmtSettingPace(options?.defaultEasyPace)
      ? { key: "easy", label: "Easy setting", value: fmtSettingPace(options?.defaultEasyPace) }
      : null,
    fmtSettingPace(options?.defaultCooldownPace)
      ? { key: "recovery", label: "Recovery setting", value: fmtSettingPace(options?.defaultCooldownPace) }
      : null,
    plan.paces.T ? { key: "tempo", label: "Tempo", value: fmtPace(plan.paces.T) } : null,
    plan.paces.I ? { key: "intervals", label: "Intervals", value: fmtPace(plan.paces.I) } : null,
    plan.paces.M ? { key: "marathon-pace", label: "MP", value: fmtPace(plan.paces.M) } : null,
  ].filter((item): item is ExportPaceItem => item !== null);
}

export function planPaceReferenceText(plan: TrainingPlan, options?: PlanExportOptions): string {
  return buildPaceReference(plan, options)
    .map((item) => `${item.label}: ${item.value}`)
    .join("   ·   ");
}

function buildSession(session: PlannedSession, options?: PlanExportOptions): ExportSession {
  return {
    dayIndex: session.day_index,
    date: session.date,
    weekdayDate: formatWeekdayDate(session.date),
    shortDate: formatShortPlanDate(session.date),
    type: session.type,
    label: planSessionLabel(session.type),
    role: session.session_role ?? "",
    distance: fmtDistance(session.target_km),
    targetKm: session.target_km,
    pace: sessionPaceForExport(session, options),
    hrZone: options?.includeHrZones === false ? "" : session.hr_zone ?? "",
    rpe: fmtNumber(session.target_rpe),
    description: session.description,
    rationale: options?.includeRationale === false ? "" : session.rationale,
    mainSet: session.main_set ?? "",
    isRest: session.type === "rest",
  };
}

function buildWeek(week: TrainingPlan["weeks"][number], options?: PlanExportOptions): ExportWeek {
  const phase = planPhaseLabel(week.phase);
  const label = week.is_deload ? `${phase} · Deload` : phase;
  const sessions = options?.includeRestDays === false
    ? week.sessions.filter((session) => session.type !== "rest")
    : week.sessions;
  return {
    index: week.week_index,
    number: week.week_index + 1,
    phase,
    isDeload: week.is_deload,
    label,
    dateRange: formatWeekRange(week),
    totalKm: week.total_km,
    totalDistance: `${week.total_km.toFixed(0)} km`,
    longRunKm: week.long_run_km,
    longRunDistance: fmtDistance(week.long_run_km),
    qualityCount: week.quality_count,
    sessions: sessions.map((session) => buildSession(session, options)),
  };
}

function scopedWeeks(plan: TrainingPlan, options?: PlanExportOptions): TrainingPlan["weeks"] {
  const lastIndex = Math.max(0, plan.weeks.length - 1);
  const start = Math.min(Math.max(0, options?.weekStartIndex ?? 0), lastIndex);
  const end = Math.min(Math.max(start, options?.weekEndIndex ?? lastIndex), lastIndex);
  return plan.weeks.slice(start, end + 1);
}

export function buildPlanExportModel(plan: TrainingPlan, options?: PlanExportOptions): PlanExportModel {
  const goalRace = planGoalLabel(plan.meta.goal_race);
  const weeks = scopedWeeks(plan, options);
  const totalKm = weeks.reduce((sum, week) => sum + week.total_km, 0);
  const firstSession = weeks[0]?.sessions[0];
  const lastWeek = weeks.at(-1);
  const lastSession = lastWeek?.sessions.at(-1);
  const goalDate = formatPlanDate(plan.meta.goal_date, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return {
    brand: {
      name: BRAND_NAME,
      label: BRAND_EXPORT_LABEL,
      motto: BRAND_MOTTO,
    },
    title: `${goalRace} Training Plan`,
    subtitle: `${titleCase(plan.meta.level)} · ${weeks.length || plan.meta.weeks_total} weeks · Goal: ${goalDate}`,
    meta: {
      goalRace,
      level: titleCase(plan.meta.level),
      weeksTotal: weeks.length || plan.meta.weeks_total,
      startDate: firstSession?.date ?? plan.meta.start_date,
      endDate: lastSession?.date ?? plan.meta.goal_date,
      goalDate,
      totalKm,
      generatedAt: plan.meta.generated_at,
    },
    paceReference: buildPaceReference(plan, options),
    weeks: weeks.map((week) => buildWeek(week, options)),
    warnings: options?.includeWarnings === false ? [] : plan.warnings,
  };
}
