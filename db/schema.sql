-- Server-side persistence for OAuth provider integrations.
-- Apply this in a free Supabase project SQL editor before enabling Strava sync.

create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text,
  password_salt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_users
  add column if not exists password_hash text;

alter table app_users
  add column if not exists password_salt text;

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  provider text not null check (provider in ('strava')),
  provider_user_id text not null,
  display_name text,
  scopes text[] not null default '{}',
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_token_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_user_id),
  unique (user_id, provider)
);

create table if not exists provider_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  provider_connection_id uuid not null references provider_connections(id) on delete cascade,
  provider text not null check (provider in ('strava')),
  provider_activity_id text not null,
  name text not null,
  sport_type text,
  started_at timestamptz not null,
  local_date date not null,
  distance_km numeric not null,
  duration_min numeric not null,
  avg_hr integer,
  max_hr integer,
  raw jsonb not null default '{}'::jsonb,
  imported_into_plan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_activity_id)
);

create table if not exists provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('strava')),
  provider_event_id text not null,
  provider_user_id text,
  provider_activity_id text,
  aspect_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists provider_activities_user_date_idx
  on provider_activities (user_id, local_date desc);

create index if not exists provider_connections_provider_user_idx
  on provider_connections (provider, provider_user_id);

create index if not exists auth_sessions_token_hash_idx
  on auth_sessions (token_hash)
  where revoked_at is null;
