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
  race:          "pace",
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

// Buffer around the user's stated easy/recovery pace, in seconds per km. Easy
// running has a wide ideal band — fresher days come in faster, fatigued days
// drift slower. ±15 s/km matches Daniels' E-pace window.
const EASY_PACE_BUFFER_S = 15;

function parseUserPaceToSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d+):(\d{2})/);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function easyUserPaceRange(seconds: number): string {
  return `${fmtPaceSKm(seconds - EASY_PACE_BUFFER_S)}–${fmtPaceSKm(seconds + EASY_PACE_BUFFER_S)} /km`;
}

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
  const isEasyType = EASY_PACE_SUPPRESSED_TYPES.has(sessionType);
  const rpeStr = fmtRpe(rpe, sessionType);
  const hrStr = hrBpmRange(hrZone, hrZones);
  const hrLabel = hrZone ? (HR_ZONE_LABELS[hrZone] ?? hrZone) : "HR target";

  // Easy/recovery: each mode shows only its own metric. The user has
  // explicitly picked a tab — keep the view focused on that signal and let
  // the recommendation banner steer them back to RPE/HR. Pace mode synthesises
  // a window from the user's stated easy pace ± buffer.
  if (isEasyType) {
    const userPaceSec = parseUserPaceToSeconds(
      sessionType === "recovery" ? options.recoveryPaceTarget : options.easyPaceTarget,
    );
    const userPaceRange = userPaceSec !== null ? easyUserPaceRange(userPaceSec) : null;

    if (mode === "pace") {
      return {
        displayMode: "pace",
        primaryLabel: sessionType === "recovery" ? "Recovery pace window" : "Easy pace window",
        primaryValue: userPaceRange ?? "Set in Settings",
        secondary: [],
        warning: null,
        recommendedMode: recMode,
      };
    }
    if (mode === "rpe") {
      return {
        displayMode: "rpe",
        primaryLabel: "RPE",
        primaryValue: rpeStr ?? "—",
        secondary: [],
        warning: null,
        recommendedMode: recMode,
      };
    }
    return {
      displayMode: "hr",
      primaryLabel: hrLabel,
      primaryValue: hrStr ?? "—",
      secondary: [],
      warning: null,
      recommendedMode: recMode,
    };
  }

  const displayMode = mode;
  const paceStr = fmtPaceRange(paceLow, paceHigh);
  const paceLabel = "Target pace";
  const paceSecondaryLabel = "Pace (ref)";
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
        paceStr ? { label: paceSecondaryLabel, value: paceStr } : null,
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
      paceStr ? { label: paceSecondaryLabel, value: paceStr } : null,
    ]),
    warning,
    recommendedMode: recMode,
  };
}

