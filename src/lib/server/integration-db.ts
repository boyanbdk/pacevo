import {
  patchRows,
  selectRows,
  upsertRows,
  type AppUserRow,
  type AuthSessionRow,
  type ProviderActivityRow,
  type ProviderConnectionRow,
} from "./supabase-rest";

export type { AppUserRow, AuthSessionRow, ProviderConnectionRow } from "./supabase-rest";

export type StravaConnectionInput = {
  userId: string;
  providerUserId: string;
  displayName: string | null;
  scopes: string[];
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  accessTokenExpiresAt: string;
};

export type ProviderActivityInput = {
  userId: string;
  providerConnectionId: string;
  providerActivityId: string;
  name: string;
  sportType: string | null;
  startedAt: string;
  localDate: string;
  distanceKm: number;
  durationMin: number;
  avgHr: number | null;
  maxHr: number | null;
  raw: unknown;
};

export async function findOrCreateUserByEmail(email: string): Promise<AppUserRow> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("Email is required.");

  const [user] = await upsertRows(
    "app_users",
    [{ email: normalized, updated_at: new Date().toISOString() }],
    { onConflict: "email" },
  );
  return user as AppUserRow;
}

export async function getUserByEmail(email: string): Promise<AppUserRow | null> {
  const [user] = await selectRows<AppUserRow>("app_users", {
    email: `eq.${email.trim().toLowerCase()}`,
    limit: 1,
  });
  return user ?? null;
}

export async function updateUserPassword(
  userId: string,
  passwordHash: string,
  passwordSalt: string,
): Promise<AppUserRow> {
  const [user] = await patchRows<AppUserRow>(
    "app_users",
    {
      password_hash: passwordHash,
      password_salt: passwordSalt,
      updated_at: new Date().toISOString(),
    },
    { id: `eq.${userId}` },
  );
  return user;
}

export async function getUserById(id: string): Promise<AppUserRow | null> {
  const [user] = await selectRows<AppUserRow>("app_users", {
    id: `eq.${id}`,
    limit: 1,
  });
  return user ?? null;
}

export async function createAuthSession(input: {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}): Promise<AuthSessionRow> {
  const [session] = await upsertRows(
    "auth_sessions",
    [{
      user_id: input.userId,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
    }],
    { onConflict: "token_hash" },
  );
  return session as AuthSessionRow;
}

export async function getActiveAuthSession(tokenHash: string): Promise<AuthSessionRow | null> {
  const [session] = await selectRows<AuthSessionRow>("auth_sessions", {
    token_hash: `eq.${tokenHash}`,
    revoked_at: "is.null",
    expires_at: `gt.${new Date().toISOString()}`,
    limit: 1,
  });
  return session ?? null;
}

export async function revokeAuthSession(tokenHash: string): Promise<void> {
  await patchRows(
    "auth_sessions",
    { revoked_at: new Date().toISOString() },
    { token_hash: `eq.${tokenHash}` },
  );
}

export async function upsertStravaConnection(input: StravaConnectionInput): Promise<ProviderConnectionRow> {
  const [connection] = await upsertRows(
    "provider_connections",
    [{
      user_id: input.userId,
      provider: "strava",
      provider_user_id: input.providerUserId,
      display_name: input.displayName,
      scopes: input.scopes,
      access_token_ciphertext: input.accessTokenCiphertext,
      refresh_token_ciphertext: input.refreshTokenCiphertext,
      access_token_expires_at: input.accessTokenExpiresAt,
      updated_at: new Date().toISOString(),
    }],
    { onConflict: "user_id,provider" },
  );
  return connection as ProviderConnectionRow;
}

export async function getStravaConnectionByAthleteId(athleteId: string): Promise<ProviderConnectionRow | null> {
  const [connection] = await selectRows<ProviderConnectionRow>("provider_connections", {
    provider: "eq.strava",
    provider_user_id: `eq.${athleteId}`,
    limit: 1,
  });
  return connection ?? null;
}

export async function getStravaConnectionForUser(userId: string): Promise<ProviderConnectionRow | null> {
  const [connection] = await selectRows<ProviderConnectionRow>("provider_connections", {
    provider: "eq.strava",
    user_id: `eq.${userId}`,
    limit: 1,
  });
  return connection ?? null;
}

export async function updateStravaConnectionTokens(
  connectionId: string,
  patch: Pick<ProviderConnectionRow, "access_token_ciphertext" | "refresh_token_ciphertext" | "access_token_expires_at">,
): Promise<ProviderConnectionRow> {
  const [connection] = await patchRows<ProviderConnectionRow>(
    "provider_connections",
    { ...patch, updated_at: new Date().toISOString() },
    { id: `eq.${connectionId}` },
  );
  return connection;
}

export async function upsertProviderActivity(input: ProviderActivityInput): Promise<ProviderActivityRow> {
  const [activity] = await upsertRows(
    "provider_activities",
    [{
      user_id: input.userId,
      provider_connection_id: input.providerConnectionId,
      provider: "strava",
      provider_activity_id: input.providerActivityId,
      name: input.name,
      sport_type: input.sportType,
      started_at: input.startedAt,
      local_date: input.localDate,
      distance_km: input.distanceKm,
      duration_min: input.durationMin,
      avg_hr: input.avgHr,
      max_hr: input.maxHr,
      raw: input.raw,
      updated_at: new Date().toISOString(),
    }],
    { onConflict: "provider,provider_activity_id" },
  );
  return activity as ProviderActivityRow;
}

export async function listProviderActivitiesForUser(userId: string): Promise<ProviderActivityRow[]> {
  return selectRows<ProviderActivityRow>("provider_activities", {
    user_id: `eq.${userId}`,
    order: "local_date.desc",
  });
}

export async function recordWebhookEvent(input: {
  providerEventId: string;
  providerUserId: string | null;
  providerActivityId: string | null;
  aspectType: string;
  payload: unknown;
}): Promise<void> {
  await upsertRows(
    "provider_webhook_events",
    [{
      provider: "strava",
      provider_event_id: input.providerEventId,
      provider_user_id: input.providerUserId,
      provider_activity_id: input.providerActivityId,
      aspect_type: input.aspectType,
      payload: input.payload,
    }],
    { onConflict: "provider,provider_event_id" },
  );
}

export async function markWebhookEventProcessed(providerEventId: string, error?: string): Promise<void> {
  await patchRows(
    "provider_webhook_events",
    {
      processed_at: new Date().toISOString(),
      error: error ?? null,
    },
    {
      provider: "eq.strava",
      provider_event_id: `eq.${providerEventId}`,
    },
  );
}
