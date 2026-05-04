// Centralized intensity target model.
// All intensity rendering (pace, RPE, HR) for a PlannedSession goes through here.
//
// Safety priority order (from implementation plan):
//   1. Medical/injury flags
//   2. Current load / ACWR limits
//   3. Hard/easy spacing
//   4. Phase purpose
//   5. Goal-race specificity
//   6. User preference  ← intensity mode lives here
//   7. Novelty

import type { HrZones, IntensityMode, SessionType } from "./types";

// ---------------------------------------------------------------------------
// RPE ranges
// Source: CDC intensity scale + Daniels Running Formula for effort mapping.
// ---------------------------------------------------------------------------

export const RPE_RANGES: Partial<Record<SessionType, [number, number]>> = {
  recovery:      [2, 3],
  easy:          [3, 4],
  long:          [4, 5],
  strides:       [7, 9],
  hills:         [7, 8],
  fartlek:       [5, 7],
  tempo:         [6, 8],
  interval:      [8, 9],
  marathon_pace: [5, 7],
  repetition:    [7, 9],
  cross:         [3, 5],
};

// ---------------------------------------------------------------------------
// Recommended mode per session type
// Matches the display policy in the implementation plan.
// ---------------------------------------------------------------------------

export const RECOMMENDED_MODE: Record<SessionType, IntensityMode> = {
  recovery:      "hr",
  easy:          "hr",
  long:          "hr",
  strides:       "pace",
  hills:         "rpe",
  fartlek:       "rpe",
  tempo:         "pace",
  interval:      "pace",
  marathon_pace: "pace",
  repetition:    "pace",
  cross:         "hr",
  rest:          "rpe",
};

// Session types where HR lags enough that using it as primary is misleading.
const HR_LAG_TYPES = new Set<SessionType>([
  "tempo", "interval", "repetition", "strides", "hills",
]);

export const HR_LAG_WARNING =
  "Heart rate lags 1–2 min during short efforts. Use pace or RPE as your primary guide for this session.";

// ---------------------------------------------------------------------------
// Zone names shown in UI
// ---------------------------------------------------------------------------

export const HR_ZONE_LABELS: Record<string, string> = {
  Z1: "Z1 — Recovery",
  Z2: "Z2 — Easy",
  Z3: "Z3 — Aerobic",
  Z4: "Z4 — Threshold",
  Z5: "Z5 — VO₂ Max",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function fmtPaceSKm(sKm: number): string {
  const m = Math.floor(sKm / 60);
  const s = sKm % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtPaceRange(low: number | null, high: number | null): string | null {
  if (!low && !high) return null;
  if (low && high && low !== high) return `${fmtPaceSKm(low)}–${fmtPaceSKm(high)} /km`;
  return `${fmtPaceSKm(low ?? high!)} /km`;
}

export function hrBpmRange(zone: string | null, hrZones: HrZones): string | null {
  if (!zone) return null;
  const zk = zone as keyof HrZones;
  const bounds = hrZones[zk];
  if (!bounds) return null;
  return `${bounds[0]}–${bounds[1]} bpm`;
}

export function fmtRpe(rpe: number | null, type: SessionType): string | null {
  if (rpe !== null) return `${rpe}/10`;
  const range = RPE_RANGES[type];
  if (!range) return null;
  return `${range[0]}–${range[1]} /10`;
}

// ---------------------------------------------------------------------------
// Main rendering API
// ---------------------------------------------------------------------------

export type SecondaryItem = { label: string; value: string };

export type IntensityDisplay = {
  displayMode: IntensityMode;
  // What to show large at the top of the session card
  primaryLabel: string;
  primaryValue: string;
  // Smaller supporting metrics shown below
  secondary: SecondaryItem[];
  // Non-null when HR mode is selected for a pace-primary session
  warning: string | null;
  // The mode the system recommends for this session type
  recommendedMode: IntensityMode;
};

const EASY_PACE_SUPPRESSED_TYPES = new Set<SessionType>(["easy", "recovery"]);

export function renderIntensity(
  sessionType: SessionType,
  paceLow: number | null,
  paceHigh: number | null,
  hrZone: string | null,
  rpe: number | null,
  hrZones: HrZones,
  mode: IntensityMode,
  options: {
    showEasyRunPaceTargets?: boolean;
    easyPaceTarget?: string | null;
    recoveryPaceTarget?: string | null;
  } = {},
): IntensityDisplay {
  const recMode = RECOMMENDED_MODE[sessionType] ?? "pace";
  const easyRunPaceStr = easyRunPaceTarget(sessionType, options);
  const suppressPace =
    EASY_PACE_SUPPRESSED_TYPES.has(sessionType) && easyRunPaceStr === null;
  const displayMode = suppressPace && mode === "pace" ? recMode : mode;
  const paceStr = EASY_PACE_SUPPRESSED_TYPES.has(sessionType)
    ? easyRunPaceStr
    : fmtPaceRange(paceLow, paceHigh);
  const paceLabel = EASY_PACE_SUPPRESSED_TYPES.has(sessionType) ? "Pace setting" : "Target pace";
  const paceSecondaryLabel = EASY_PACE_SUPPRESSED_TYPES.has(sessionType) ? "Pace (setting)" : "Pace (ref)";
  const rpeStr = fmtRpe(rpe, sessionType);
  const hrStr = hrBpmRange(hrZone, hrZones);
  const hrLabel = hrZone ? (HR_ZONE_LABELS[hrZone] ?? hrZone) : "HR target";
  const warning =
    displayMode === "hr" && HR_LAG_TYPES.has(sessionType) ? HR_LAG_WARNING : null;

  const compact = <T,>(items: (T | null | undefined)[]): T[] =>
    items.filter((x): x is T => x != null);

  if (displayMode === "pace") {
    return {
      displayMode,
      primaryLabel: paceLabel,
      primaryValue: paceStr ?? "—",
      secondary: compact([
        rpeStr ? { label: "RPE", value: rpeStr } : null,
        hrStr && hrZone ? { label: hrZone, value: hrStr } : null,
      ]),
      warning,
      recommendedMode: recMode,
    };
  }

  if (displayMode === "rpe") {
    return {
      displayMode,
      primaryLabel: "RPE",
      primaryValue: rpeStr ?? "—",
      secondary: compact([
        paceStr && !suppressPace ? { label: paceSecondaryLabel, value: paceStr } : null,
        hrStr && hrZone ? { label: hrZone, value: hrStr } : null,
      ]),
      warning,
      recommendedMode: recMode,
    };
  }

  // hr mode
  return {
    displayMode,
    primaryLabel: hrLabel,
    primaryValue: hrStr ?? "—",
    secondary: compact([
      rpeStr ? { label: "RPE", value: rpeStr } : null,
      paceStr && !suppressPace ? { label: paceSecondaryLabel, value: paceStr } : null,
    ]),
    warning,
    recommendedMode: recMode,
  };
}

function easyRunPaceTarget(
  sessionType: SessionType,
  options: {
    showEasyRunPaceTargets?: boolean;
    easyPaceTarget?: string | null;
    recoveryPaceTarget?: string | null;
  },
): string | null {
  if (!EASY_PACE_SUPPRESSED_TYPES.has(sessionType) || options.showEasyRunPaceTargets !== true) {
    return null;
  }
  const value = sessionType === "recovery" ? options.recoveryPaceTarget : options.easyPaceTarget;
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.includes("/") ? trimmed : `${trimmed} /km`;
}
