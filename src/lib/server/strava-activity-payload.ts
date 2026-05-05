import type { ImportedActivity } from "@/domain/training-plan/activity-import";
import type { ProviderActivityRow, ProviderConnectionRow } from "./supabase-rest";

export type StravaActivityListPayload = {
  connected: boolean;
  synced?: number;
  lastSyncedAt: string | null;
  lastSyncStartedAt: string | null;
  lastSyncError: string | null;
  activities: ImportedActivity[];
};

export type StravaActivityDetailPayload = ImportedActivity & {
  providerActivityId: string;
  sportType: string | null;
  importedIntoPlanAt: string | null;
  raw: unknown;
};

function numeric(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function stravaConnectionMetadata(connection: ProviderConnectionRow) {
  return {
    lastSyncedAt: connection.last_synced_at,
    lastSyncStartedAt: connection.last_sync_started_at,
    lastSyncError: connection.last_sync_error,
  };
}

export function stravaActivityPayload(activity: ProviderActivityRow): ImportedActivity {
  const providerActivityId = activity.provider_activity_id;
  return {
    id: `strava:${providerActivityId}`,
    providerActivityId,
    source: "strava",
    fileName: "Strava",
    name: activity.name,
    startedAt: activity.started_at,
    date: activity.local_date,
    distanceKm: numeric(activity.distance_km) ?? 0,
    durationMin: numeric(activity.duration_min) ?? 0,
    movingTimeMin: numeric(activity.moving_time_min),
    elapsedTimeMin: numeric(activity.elapsed_time_min),
    avgHR: activity.avg_hr,
    maxHR: activity.max_hr,
  };
}

export function stravaActivityDetailPayload(activity: ProviderActivityRow): StravaActivityDetailPayload {
  return {
    ...stravaActivityPayload(activity),
    providerActivityId: activity.provider_activity_id,
    sportType: activity.sport_type,
    importedIntoPlanAt: activity.imported_into_plan_at,
    raw: activity.raw,
  };
}
