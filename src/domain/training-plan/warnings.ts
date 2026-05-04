export type ParsedPlanWarning =
  | { scope: "plan"; message: string }
  | { scope: "week"; weekNumber: number; message: string };

const WEEK_WARNING_RE = /^Week\s+(\d+):\s*(.+)$/i;

export function formatWeekWarning(weekNumber: number, message: string): string {
  return `Week ${weekNumber}: ${message}`;
}

export function parsePlanWarning(warning: string): ParsedPlanWarning {
  const match = WEEK_WARNING_RE.exec(warning.trim());
  if (!match) return { scope: "plan", message: warning };

  const weekNumber = Number.parseInt(match[1], 10);
  if (!Number.isInteger(weekNumber) || weekNumber < 1) {
    return { scope: "plan", message: warning };
  }

  return {
    scope: "week",
    weekNumber,
    message: match[2],
  };
}

export function splitPlanWarnings(warnings: string[]): {
  planWarnings: string[];
  warningsByWeekNumber: Record<number, string[]>;
} {
  const planWarnings: string[] = [];
  const warningsByWeekNumber: Record<number, string[]> = {};

  for (const warning of warnings) {
    const parsed = parsePlanWarning(warning);
    if (parsed.scope === "plan") {
      planWarnings.push(parsed.message);
      continue;
    }

    warningsByWeekNumber[parsed.weekNumber] ??= [];
    warningsByWeekNumber[parsed.weekNumber].push(parsed.message);
  }

  return { planWarnings, warningsByWeekNumber };
}
