// Runner level classification.
// Source: adapted from Pfitzinger Advanced Marathoning 3rd ed. and Higdon plan entry criteria.

import { GoalRace, Level } from "./types";

const WEEKLY_KM_THRESHOLDS: Record<GoalRace, [number, number]> = {
  "5K":       [25, 60],
  "10K":      [30, 70],
  "half":     [35, 75],
  "marathon": [50, 90],
};

const LONG_RUN_THRESHOLDS: Record<GoalRace, [number, number]> = {
  "5K":       [5,  12],
  "10K":      [8,  16],
  "half":     [10, 20],
  "marathon": [16, 29],
};

const VDOT_THRESHOLDS: Record<GoalRace, [number, number]> = {
  "5K":       [42, 55],
  "10K":      [40, 53],
  "half":     [38, 50],
  "marathon": [36, 48],
};

const LEVEL_ORDER: Level[] = ["beginner", "intermediate", "advanced"];

function scoreSignal(value: number, [intermediate, advanced]: [number, number]): Level {
  if (value >= advanced) return "advanced";
  if (value >= intermediate) return "intermediate";
  return "beginner";
}

export function classifyRunner(
  goalRace: GoalRace,
  currentWeeklyKm: number,
  longestRecentKm: number,
  vdot?: number | null,
): Level {
  const levels: Level[] = [
    scoreSignal(currentWeeklyKm, WEEKLY_KM_THRESHOLDS[goalRace]),
    scoreSignal(longestRecentKm, LONG_RUN_THRESHOLDS[goalRace]),
  ];

  if (vdot != null) {
    levels.push(scoreSignal(vdot, VDOT_THRESHOLDS[goalRace]));
  }

  // Conservative: take the minimum level across all signals.
  return levels.reduce((min, l) =>
    LEVEL_ORDER.indexOf(l) < LEVEL_ORDER.indexOf(min) ? l : min
  );
}
