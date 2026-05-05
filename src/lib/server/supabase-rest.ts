import { requiredEnv } from "./env";

type QueryValue = string | number | boolean | null;

export type AppUserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  password_salt: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthSessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

export type ProviderConnectionRow = {
  id: string;
  user_id: string;
  provider: "strava";
  provider_user_id: string;
  display_name: string | null;
  scopes: string[];
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  access_token_expires_at: string;
  last_synced_at: string | null;
  last_sync_started_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

export type ProviderActivityRow = {
  id: string;
  user_id: string;
  provider_connection_id: string;
  provider: "strava";
  provider_activity_id: string;
  name: string;
  sport_type: string | null;
  started_at: string;
  local_date: string;
  distance_km: number;
  duration_min: number;
  moving_time_min: number | null;
  elapsed_time_min: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  raw: unknown;
  imported_into_plan_at: string | null;
  created_at: string;
  updated_at: string;
};

type UpsertOptions = {
  onConflict: string;
};

function endpoint(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`/rest/v1/${path}`, requiredEnv("SUPABASE_URL"));
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function request<T>(path: string, init: RequestInit = {}, query?: Record<string, QueryValue>): Promise<T> {
  const response = await fetch(endpoint(path, query), {
    ...init,
    headers: {
      apikey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: `Bearer ${requiredEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${body}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function upsertRows<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  options: UpsertOptions,
): Promise<T[]> {
  return request<T[]>(
    table,
    {
      method: "POST",
      body: JSON.stringify(rows),
      headers: {
        Prefer: `resolution=merge-duplicates,return=representation`,
      },
    },
    { on_conflict: options.onConflict },
  );
}

export async function patchRows<T>(
  table: string,
  patch: Record<string, unknown>,
  query: Record<string, QueryValue>,
): Promise<T[]> {
  return request<T[]>(table, { method: "PATCH", body: JSON.stringify(patch) }, query);
}

export async function selectRows<T>(
  table: string,
  query: Record<string, QueryValue>,
): Promise<T[]> {
  return request<T[]>(table, { method: "GET" }, query);
}
