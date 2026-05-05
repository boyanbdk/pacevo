import crypto from "node:crypto";
import { appBaseUrl, requiredEnv } from "./env";
import {
  getStravaConnectionByAthleteId,
  updateStravaConnectionTokens,
  upsertProviderActivity,
  type ProviderActivityInput,
  type ProviderConnectionRow,
} from "./integration-db";
import { decryptToken, encryptToken } from "./token-crypto";

type StravaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete?: {
    id: number;
    firstname?: string;
    lastname?: string;
    username?: string;
  };
};

type StravaActivity = {
  id: number;
  name?: string;
  sport_type?: string;
  type?: string;
  start_date?: string;
  start_date_local?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  average_heartrate?: number;
  max_heartrate?: number;
};

export function stravaAuthorizationUrl(userId: string): string {
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", requiredEnv("STRAVA_CLIENT_ID"));
  url.searchParams.set("redirect_uri", `${appBaseUrl()}/api/integrations/strava/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "activity:read");
  url.searchParams.set("state", userId);
  return url.toString();
}

export async function exchangeAuthorizationCode(code: string): Promise<StravaTokenResponse> {
  const response = await fetch("https://www.strava.com/api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: requiredEnv("STRAVA_CLIENT_ID"),
      client_secret: requiredEnv("STRAVA_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new Error(`Strava token exchange failed (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<StravaTokenResponse>;
}

async function refreshAccessToken(connection: ProviderConnectionRow): Promise<ProviderConnectionRow> {
  const response = await fetch("https://www.strava.com/api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: requiredEnv("STRAVA_CLIENT_ID"),
      client_secret: requiredEnv("STRAVA_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: decryptToken(connection.refresh_token_ciphertext),
    }),
  });
  if (!response.ok) {
    throw new Error(`Strava token refresh failed (${response.status}): ${await response.text()}`);
  }
  const token = await response.json() as StravaTokenResponse;
  return updateStravaConnectionTokens(connection.id, {
    access_token_ciphertext: encryptToken(token.access_token),
    refresh_token_ciphertext: encryptToken(token.refresh_token),
    access_token_expires_at: new Date(token.expires_at * 1000).toISOString(),
  });
}

async function validAccessToken(connection: ProviderConnectionRow): Promise<{ connection: ProviderConnectionRow; accessToken: string }> {
  const expiresAt = Date.parse(connection.access_token_expires_at);
  const current = Number.isFinite(expiresAt) && expiresAt - Date.now() > 5 * 60 * 1000
    ? connection
    : await refreshAccessToken(connection);
  return {
    connection: current,
    accessToken: decryptToken(current.access_token_ciphertext),
  };
}

function localDateFromActivity(activity: StravaActivity): string {
  const value = activity.start_date_local ?? activity.start_date;
  if (!value) throw new Error("Strava activity is missing a start date.");
  return value.slice(0, 10);
}

function normalizeActivity(
  connection: ProviderConnectionRow,
  activity: StravaActivity,
): ProviderActivityInput {
  if (!activity.start_date) {
    throw new Error(`Strava activity ${activity.id} is missing start_date.`);
  }

  const distanceKm = Math.round(((activity.distance ?? 0) / 1000) * 100) / 100;
  const movingTimeMin = activity.moving_time ? Math.round((activity.moving_time / 60) * 10) / 10 : null;
  const elapsedTimeMin = activity.elapsed_time ? Math.round((activity.elapsed_time / 60) * 10) / 10 : null;
  const durationMin = movingTimeMin ?? elapsedTimeMin ?? 0;
  if (distanceKm <= 0 || durationMin <= 0) {
    throw new Error(`Strava activity ${activity.id} does not look like a completed distance activity.`);
  }

  return {
    userId: connection.user_id,
    providerConnectionId: connection.id,
    providerActivityId: String(activity.id),
    name: activity.name?.trim() || "Strava activity",
    sportType: activity.sport_type ?? activity.type ?? null,
    startedAt: activity.start_date,
    localDate: localDateFromActivity(activity),
    distanceKm,
    durationMin,
    movingTimeMin,
    elapsedTimeMin,
    avgHr: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
    maxHr: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,
    raw: activity,
  };
}

export async function fetchAndStoreStravaActivity(connection: ProviderConnectionRow, activityId: string): Promise<void> {
  const token = await validAccessToken(connection);
  const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Strava activity fetch failed (${response.status}): ${await response.text()}`);
  }
  const activity = await response.json() as StravaActivity;
  await upsertProviderActivity(normalizeActivity(token.connection, activity));
}

export async function fetchAndStoreRecentStravaActivities(connection: ProviderConnectionRow, after?: number): Promise<number> {
  const token = await validAccessToken(connection);
  const url = new URL("https://www.strava.com/api/v3/athlete/activities");
  url.searchParams.set("per_page", "30");
  if (after) url.searchParams.set("after", String(after));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Strava activities fetch failed (${response.status}): ${await response.text()}`);
  }

  const activities = await response.json() as StravaActivity[];
  let stored = 0;
  for (const activity of activities) {
    if ((activity.sport_type ?? activity.type) !== "Run") continue;
    await upsertProviderActivity(normalizeActivity(token.connection, activity));
    stored += 1;
  }
  return stored;
}

export function verifyStravaWebhookSignature(rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key, rest.join("=")];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = crypto
    .createHmac("sha256", requiredEnv("STRAVA_WEBHOOK_SIGNING_SECRET"))
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function getConnectionForStravaOwner(ownerId: string): Promise<ProviderConnectionRow | null> {
  return getStravaConnectionByAthleteId(ownerId);
}
