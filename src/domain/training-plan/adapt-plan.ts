// Adaptive layer for training plans.
// Runs after sessions are logged and checks six rules in priority order.
// Each fired rule produces an AdaptationResult that the caller can persist.
//
// Sources:
//   ACWR model — Gabbett T. (2016) BJSM 50:273.
//   Aerobic deficit / Z2 policing — Seiler (2010) IJSPP 5:276.
//   VDOT update — Daniels' Running Formula, 4th ed.

import { TrainingPlan, TrainingWeek, PlannedSession, SessionType } from "./types";
import { vdotFromRace, pacesFromVdot } from "./vdot";
import type { CompletedSession, AdaptationRule } from "@/lib/plan-storage";

export type AdaptationResult = {
  rule: AdaptationRule;
  explanation: string; // plain English, under 200 chars
  triggeredBySessionIds: string[];
  newPlan: TrainingPlan;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function cloneWeeks(weeks: TrainingWeek[]): TrainingWeek[] {
  return weeks.map((w) => ({
    ...w,
    sessions: w.sessions.map((s) => ({ ...s })),
  }));
}

/** Weekly kilometres for a given week index, using completed sessions if available. */
function weekActualKm(
  week: TrainingWeek,
  completedForWeek: CompletedSession[],
): number {
  let total = 0;
  for (const session of week.sessions) {
    const completed = completedForWeek.find((c) => c.dayIndex === session.day_index);
    if (completed?.actualKm) {
      total += completed.actualKm;
    } else if (session.target_km) {
      total += session.target_km;
    }
  }
  return total;
}

/** Chronic load: mean of the four weeks before `weekIndex`. */
function chronicLoad(plan: TrainingPlan, allCompleted: CompletedSession[], weekIndex: number): number {
  const start = Math.max(0, weekIndex - 4);
  const relevant = plan.weeks.slice(start, weekIndex);
  if (relevant.length === 0) return plan.weeks[0]?.total_km ?? 0;

  const loads = relevant.map((w) => {
    const completedForWeek = allCompleted.filter((c) => c.weekIndex === w.week_index);
    return weekActualKm(w, completedForWeek);
  });
  return loads.reduce((a, b) => a + b, 0) / loads.length;
}

// ---------------------------------------------------------------------------
// Rule: ACWR_CAP
// If the next-upcoming non-started week's planned load / chronic average > 1.3,
// scale the week down to ACWR = 1.3.
// Source: Gabbett (2016) — safe ACWR range 0.8–1.3.
// ---------------------------------------------------------------------------

export function checkAcwrCap(
  plan: TrainingPlan,
  completed: CompletedSession[],
  currentWeekIndex: number,
): AdaptationResult | null {
  const targetWeekIndex = currentWeekIndex + 1;
  if (targetWeekIndex >= plan.weeks.length) return null;

  const chronic = chronicLoad(plan, completed, targetWeekIndex);
  if (chronic <= 0) return null;

  const nextWeek = plan.weeks[targetWeekIndex];
  const acute = nextWeek.total_km;
  const acwr = acute / chronic;

  if (acwr <= 1.3) return null;

  const maxAllowedKm = Math.round(chronic * 1.3 * 10) / 10;
  const scaleFactor = maxAllowedKm / acute;

  const weeks = cloneWeeks(plan.weeks);
  const week = weeks[targetWeekIndex];
  week.total_km = maxAllowedKm;
  week.long_run_km = Math.round(week.long_run_km * scaleFactor * 10) / 10;

  for (const session of week.sessions) {
    if (session.target_km) {
      session.target_km = Math.round(session.target_km * scaleFactor * 10) / 10;
    }
    if (session.target_duration_min) {
      session.target_duration_min = Math.round(session.target_duration_min * scaleFactor);
    }
  }

  return {
    rule: "ACWR_CAP",
    explanation: `Week ${targetWeekIndex + 1} load (${acute.toFixed(0)} km) would push ACWR to ${acwr.toFixed(2)}. Scaled to ${maxAllowedKm} km to stay within 1.3.`,
    triggeredBySessionIds: [],
    newPlan: { ...plan, weeks },
  };
}

// ---------------------------------------------------------------------------
// Rule: AEROBIC_DEFICIT
// If 2+ easy sessions in the last 14 days were completed above Z2 (RPE > 5
// or avg HR > Z2 ceiling), hold volume and replace the next quality session
// with an easy run.
// Source: Seiler (2010) 80/20 polarized model.
// ---------------------------------------------------------------------------

export function checkAerobicDeficit(
  plan: TrainingPlan,
  completed: CompletedSession[],
  currentWeekIndex: number,
): AdaptationResult | null {
  // Look at sessions from the last 14 days (current week + previous week)
  const lookbackWeeks = [currentWeekIndex - 1, currentWeekIndex].filter((i) => i >= 0);
  const recentEasy = completed.filter((c) => {
    if (!lookbackWeeks.includes(c.weekIndex)) return false;
    const plannedSession = plan.weeks[c.weekIndex]?.sessions.find((s) => s.day_index === c.dayIndex);
    return plannedSession?.type === "easy" || plannedSession?.type === "recovery";
  });

  const z2Ceiling = plan.hr_zones.Z2[1];

  const hardEasyRuns = recentEasy.filter((c) => {
    const aboveHR = c.avgHR !== null && z2Ceiling > 0 && c.avgHR > z2Ceiling;
    const aboveRPE = c.rpe !== null && c.rpe > 5;
    return aboveHR || aboveRPE;
  });

  if (hardEasyRuns.length < 2) return null;

  // Find the next quality session in upcoming weeks and replace with easy
  const weeks = cloneWeeks(plan.weeks);
  let replaced = false;

  for (let wi = currentWeekIndex; wi < Math.min(currentWeekIndex + 2, weeks.length); wi++) {
    const week = weeks[wi];
    const qualityTypes: SessionType[] = ["tempo", "interval", "repetition", "marathon_pace", "hills", "fartlek"];
    const qualitySession = week.sessions.find((s) => qualityTypes.includes(s.type));
    if (qualitySession) {
      qualitySession.type = "easy";
      qualitySession.description =
        `Easy run replacing a ${qualitySession.type} session. Your recent easy runs trended above Z2 — an extra easy day promotes aerobic adaptation.`;
      qualitySession.rationale =
        "Two recent easy sessions were performed above Z2. Replacing quality work with easy running to restore aerobic base.";
      qualitySession.target_rpe = 4;
      qualitySession.hr_zone = "Z2";
      qualitySession.pace_low_s_km = plan.paces.E_low;
      qualitySession.pace_high_s_km = plan.paces.E_high;
      week.quality_count = Math.max(0, week.quality_count - 1);
      replaced = true;
      break;
    }
  }

  if (!replaced) return null;

  return {
    rule: "AEROBIC_DEFICIT",
    explanation: `${hardEasyRuns.length} recent easy runs were above Z2. Next quality session replaced with easy running to restore aerobic base.`,
    triggeredBySessionIds: hardEasyRuns.map((c) => c.id),
    newPlan: { ...plan, weeks },
  };
}

// ---------------------------------------------------------------------------
// Rule: INJURY_FLAG
// When the user marks an injury flag on their inputs, swap upcoming runs for
// cross-training or rest for up to 2 weeks.
// ---------------------------------------------------------------------------

export function checkInjuryFlag(
  plan: TrainingPlan,
  inputs: { injury_flags?: string[] },
  currentWeekIndex: number,
): AdaptationResult | null {
  const flags = inputs.injury_flags ?? [];
  if (flags.length === 0) return null;

  const weeks = cloneWeeks(plan.weeks);
  const runTypes: SessionType[] = ["easy", "long", "tempo", "interval", "repetition", "marathon_pace", "recovery", "strides", "fartlek", "hills"];
  const affectedWeeks = Math.min(2, weeks.length - currentWeekIndex);

  for (let wi = currentWeekIndex; wi < currentWeekIndex + affectedWeeks; wi++) {
    for (const session of weeks[wi].sessions) {
      if (runTypes.includes(session.type)) {
        session.type = "cross";
        session.description =
          `Cross-training (cycling, swimming, pool running, or elliptical). Keep effort easy while injury resolves.`;
        session.rationale =
          `Injury flag active: ${flags.join(", ")}. Running replaced with cross-training. Consult a medical professional if pain persists.`;
        session.target_rpe = 4;
        session.hr_zone = "Z2";
        session.target_km = null;
        session.target_duration_min = session.target_duration_min ?? 30;
        session.warmup = null;
        session.main_set = null;
        session.cooldown = null;
      }
    }
  }

  return {
    rule: "INJURY_FLAG",
    explanation: `Injury flags active (${flags.join(", ")}). Running replaced with cross-training for ${affectedWeeks} week${affectedWeeks > 1 ? "s" : ""}. See a professional if pain persists.`,
    triggeredBySessionIds: [],
    newPlan: { ...plan, weeks },
  };
}

// ---------------------------------------------------------------------------
// Rule: MISSED_SESSION
// If a quality session in the current week has no completion record and it's
// past its date, redistribute it (swap with the next available easy day).
// ---------------------------------------------------------------------------

export function checkMissedSession(
  plan: TrainingPlan,
  completed: CompletedSession[],
  currentWeekIndex: number,
): AdaptationResult | null {
  const week = plan.weeks[currentWeekIndex];
  if (!week) return null;

  const today = new Date();
  const qualityTypes: SessionType[] = ["tempo", "interval", "repetition", "hills", "fartlek"];

  // Find a missed quality session (past its date, not logged)
  const missed = week.sessions.find((s) => {
    if (!qualityTypes.includes(s.type)) return false;
    const sessionDate = new Date(s.date);
    if (sessionDate >= today) return false;
    return !completed.some((c) => c.weekIndex === currentWeekIndex && c.dayIndex === s.day_index);
  });

  if (!missed) return null;

  // Find the next easy day in the same week to swap with
  const nextEasy = week.sessions.find((s) => {
    if (s.type !== "easy") return false;
    const sessionDate = new Date(s.date);
    return sessionDate >= today && !completed.some((c) => c.weekIndex === currentWeekIndex && c.dayIndex === s.day_index);
  });

  if (!nextEasy) return null;

  const weeks = cloneWeeks(plan.weeks);
  const targetWeek = weeks[currentWeekIndex];
  const missedIdx = targetWeek.sessions.findIndex((s) => s.day_index === missed.day_index);
  const easyIdx = targetWeek.sessions.findIndex((s) => s.day_index === nextEasy.day_index);

  if (missedIdx === -1 || easyIdx === -1) return null;

  // Swap sessions
  [targetWeek.sessions[missedIdx].type, targetWeek.sessions[easyIdx].type] =
    [targetWeek.sessions[easyIdx].type, targetWeek.sessions[missedIdx].type];
  [targetWeek.sessions[missedIdx].description, targetWeek.sessions[easyIdx].description] =
    [targetWeek.sessions[easyIdx].description, targetWeek.sessions[missedIdx].description];

  return {
    rule: "MISSED_SESSION",
    explanation: `Missed ${missed.type} session on day ${missed.day_index + 1} moved to day ${nextEasy.day_index + 1} within the same week.`,
    triggeredBySessionIds: [],
    newPlan: { ...plan, weeks },
  };
}

// ---------------------------------------------------------------------------
// Rule: VDOT_UPDATE
// If a logged tempo or race effort implies a materially different VDOT,
// update paces from the next week onward.
// "Materially different" = VDOT change >= 2 points.
// ---------------------------------------------------------------------------

export function checkVdotUpdate(
  plan: TrainingPlan,
  completed: CompletedSession[],
  currentWeekIndex: number,
): AdaptationResult | null {
  const currentVdot = plan.meta.vdot;
  if (!currentVdot) return null;

  // Find recent tempo/race-pace sessions with actual data
  const lookback = completed.filter((c) => {
    if (c.weekIndex < currentWeekIndex - 2) return false;
    const session = plan.weeks[c.weekIndex]?.sessions.find((s) => s.day_index === c.dayIndex);
    return session?.type === "tempo" || session?.type === "marathon_pace";
  });

  for (const c of lookback) {
    if (!c.actualKm || !c.actualDurationMin) continue;
    const distanceM = c.actualKm * 1000;
    const timeS = c.actualDurationMin * 60;
    const impliedVdot = vdotFromRace(distanceM, timeS);
    const delta = impliedVdot - currentVdot;

    if (Math.abs(delta) < 2) continue;

    const newPaces = pacesFromVdot(impliedVdot);
    const weeks = cloneWeeks(plan.weeks);

    // Update paces in weeks from next week onward
    for (let wi = currentWeekIndex + 1; wi < weeks.length; wi++) {
      for (const session of weeks[wi].sessions) {
        if (session.type === "easy" || session.type === "recovery" || session.type === "long") {
          session.pace_low_s_km = newPaces.E_low;
          session.pace_high_s_km = newPaces.E_high;
        } else if (session.type === "tempo" || session.type === "marathon_pace") {
          session.pace_low_s_km = session.pace_high_s_km = session.type === "tempo" ? (newPaces.T ?? null) : (newPaces.M ?? null);
        } else if (session.type === "interval") {
          session.pace_low_s_km = session.pace_high_s_km = newPaces.I ?? null;
        }
      }
    }

    const dir = delta > 0 ? "improved" : "declined";
    return {
      rule: "VDOT_UPDATE",
      explanation: `Recent tempo effort implies VDOT ${impliedVdot} (was ${currentVdot}, ${dir} by ${Math.abs(delta)}). Paces updated from next week.`,
      triggeredBySessionIds: [c.id],
      newPlan: {
        ...plan,
        meta: { ...plan.meta, vdot: impliedVdot, vdot_source: "race" },
        paces: newPaces,
        weeks,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main entry point
// Runs all checks in priority order. Returns the first fired result.
// Call again after applying to check for additional triggers.
// ---------------------------------------------------------------------------

export function runAdaptations(
  plan: TrainingPlan,
  completed: CompletedSession[],
  inputs: { injury_flags?: string[] },
  currentWeekIndex: number,
): AdaptationResult | null {
  return (
    checkInjuryFlag(plan, inputs, currentWeekIndex) ??
    checkAcwrCap(plan, completed, currentWeekIndex) ??
    checkAerobicDeficit(plan, completed, currentWeekIndex) ??
    checkMissedSession(plan, completed, currentWeekIndex) ??
    checkVdotUpdate(plan, completed, currentWeekIndex) ??
    null
  );
}
