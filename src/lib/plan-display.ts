import { formatPace } from "../domain/training-plan";
import type { Paces, SessionType } from "../domain/training-plan/types";
import type { UserSettings } from "../domain/workout-schema";

export type PaceReferenceItem = { label: string; value: string };

export const EASY_PACE_OPTIONAL_TYPES = new Set<SessionType>(["easy", "recovery"]);

export function settingPaceLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.includes("/") ? trimmed : `${trimmed} /km`;
}

export function planSettingsSummary(settings: UserSettings, paces: Paces): {
  headline: string;
  details: string;
} {
  const recovery = settingPaceLabel(settings.defaultCooldownPace);
  return {
    headline: settingPaceLabel(settings.defaultEasyPace) || "-",
    details: [
      "Easy setting",
      recovery ? `${recovery} recovery setting` : null,
      paces.T ? `${formatPace(paces.T)} tempo` : null,
    ].filter((item): item is string => item !== null).join(" · "),
  };
}

export function sessionPaceReferenceItems(
  sessionType: SessionType,
  paces: Paces,
  settings: UserSettings,
  showEasyRunPaceTargets: boolean,
): PaceReferenceItem[] {
  return [
    showEasyRunPaceTargets && settingPaceLabel(settings.defaultEasyPace)
      ? { label: "Easy setting", value: settingPaceLabel(settings.defaultEasyPace) }
      : null,
    showEasyRunPaceTargets && settingPaceLabel(settings.defaultCooldownPace)
      ? { label: "Recovery setting", value: settingPaceLabel(settings.defaultCooldownPace) }
      : null,
    !EASY_PACE_OPTIONAL_TYPES.has(sessionType) && paces.M
      ? { label: "Marathon pace", value: formatPace(paces.M) }
      : null,
    !EASY_PACE_OPTIONAL_TYPES.has(sessionType) && paces.T
      ? { label: "Threshold", value: formatPace(paces.T) }
      : null,
    !EASY_PACE_OPTIONAL_TYPES.has(sessionType) && paces.I
      ? { label: "Interval", value: formatPace(paces.I) }
      : null,
  ].filter((item): item is PaceReferenceItem => item !== null);
}
