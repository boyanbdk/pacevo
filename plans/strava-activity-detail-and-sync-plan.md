# Strava Activity Detail And Sync Plan

## Context

The dashboard now loads Strava activities, but two UX problems remain:

1. Recent Strava activity rows link to `/app/plans/:planId`, so clicking a run opens the current training plan instead of the run itself.
2. The dashboard calls `/api/integrations/strava/activities?sync=1` on every mount. Stored activities are durable in Supabase, but the UI behaves like every page load is a fresh Strava sync and does not expose a remembered "last synced" state.

This plan uses the gstack engineering-review lens: clarify ownership, data flow, edge cases, test surface, and rollout order before implementation.

## Goal

Make Strava activities first-class app objects:

- Recent activity rows open an individual Strava activity detail page.
- Dashboard loads already-synced activities from Supabase without hitting Strava every time.
- Manual Sync updates Supabase, updates last-sync metadata, and refreshes the dashboard.
- Plan import/matching can still use synced Strava runs.

## Non-Goals

- Do not migrate training plans from localStorage to Supabase in this pass.
- Do not build Strava webhook deployment yet.
- Do not auto-mark planned sessions complete directly from dashboard rows yet.
- Do not request broader Strava scopes than `activity:read`.

## Current Code Diagnosis

Dashboard:

- `src/app/app/page.tsx`
  - `stravaActivityItems()` creates `href: /app/plans/${plan.id}`.
  - `useEffect(() => loadStravaActivities(true), [])` forces Strava sync on every dashboard mount.

Strava API:

- `src/app/api/integrations/strava/activities/route.ts`
  - `GET ?sync=1` fetches recent Strava activities.
  - `GET` without `sync=1` already can list stored Supabase activities.
  - Response does not include provider database row id, raw fields, import status, or last sync metadata.

Database:

- `provider_activities` stores synced Strava runs.
- `provider_connections` does not currently track `last_synced_at`, `last_sync_error`, or `last_sync_started_at`.

## Proposed User Experience

Dashboard Recent Activity:

- On page load:
  - Fetch `/api/integrations/strava/activities` without `sync=1`.
  - Show stored Strava runs immediately.
  - Show status like `Last synced 12 min ago` if available.
- On clicking Sync:
  - Call `/api/integrations/strava/activities/sync` or current endpoint with `?sync=1`.
  - Update the list and last-sync timestamp.
- On clicking a Strava run:
  - Navigate to `/app/activities/strava/:providerActivityId`.

Activity Detail Page:

- Route: `/app/activities/strava/[activityId]`
- Show:
  - Activity name
  - Date/time
  - Distance
  - Duration
  - Pace
  - Average HR / max HR
  - Sport type
  - Sync/source metadata
  - "Open matching plan" or "Match to plan" action
- If the activity is already imported into a plan later, show the target session link.

## Data Model Changes

Update `db/schema.sql`:

```sql
alter table provider_connections
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_sync_started_at timestamptz,
  add column if not exists last_sync_error text;

alter table provider_activities
  add column if not exists moving_time_min numeric,
  add column if not exists elapsed_time_min numeric;
```

Notes:

- `last_synced_at` belongs on `provider_connections` because sync is connection-wide.
- Keep `provider_activities.provider_activity_id` as the public route id. Do not expose internal UUIDs unless needed.
- Keep full Strava response in `raw` for detail-page fields we do not normalize yet.

## Server API Plan

### 1. Stored Activity List

Keep:

```text
GET /api/integrations/strava/activities
```

Change behavior:

- Never call Strava unless `sync=1`.
- Return connection sync metadata:

```ts
{
  connected: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  activities: ImportedActivity[];
}
```

### 2. Manual Sync

Either keep:

```text
GET /api/integrations/strava/activities?sync=1
```

or preferably add:

```text
POST /api/integrations/strava/activities/sync
```

Recommended: add `POST` for sync because it mutates Supabase state.

Server flow:

1. Verify current user session.
2. Load Strava connection.
3. Set `last_sync_started_at`.
4. Fetch recent Strava activities.
5. Upsert runs into `provider_activities`.
6. Set `last_synced_at` and clear `last_sync_error`.
7. Return stored activities plus sync metadata.

### 3. Activity Detail API

Add:

```text
GET /api/integrations/strava/activities/[activityId]
```

Behavior:

- Verify current user session.
- Select exactly one `provider_activities` row where:
  - `user_id = currentUser.id`
  - `provider = strava`
  - `provider_activity_id = activityId`
- Return normalized fields and selected `raw` fields.
- Return `404` if the activity does not belong to the current user.

## Frontend Plan

### 1. Dashboard

Change `src/app/app/page.tsx`:

- Load stored Strava activities on mount with no sync:

```ts
useEffect(() => {
  loadStravaActivities(false);
}, []);
```

- Make Sync button call the mutating sync endpoint.
- Change `stravaActivityItems()` link from:

```ts
href: `/app/plans/${plan.id}`
```

to:

```ts
href: `/app/activities/strava/${activity.id.replace("strava:", "")}`
```

- Show:
  - synced count
  - last synced time
  - sync error if present

### 2. Activity Detail Page

Add:

```text
src/app/app/activities/strava/[activityId]/page.tsx
```

Client page approach is acceptable for consistency with the current app:

- Fetch detail API on mount.
- Render loading, error, and not-found states.
- Render a compact metrics layout matching dashboard visual style.
- Include buttons:
  - Back to dashboard
  - Match/import in plan, linking to `/app/plans/:activePlanId` when an active local plan exists

### 3. Plan Import Panel

Keep existing "Load Strava runs" behavior, but after API changes:

- First load stored activities without sync.
- Provide explicit "Sync Strava" action inside the import panel if fresh data is needed.
- Avoid background sync surprises.

## Edge Cases

- User connected Strava but has no recent runs:
  - Show "No synced Strava runs yet" plus Sync button.
- User has stored runs but Strava token refresh fails:
  - Still show stored runs.
  - Show sync error near the Sync control.
- User clicks an activity that was deleted remotely:
  - If stored locally, detail page still shows cached data.
  - Later webhook/delete handling can mark it deleted.
- User is not logged in:
  - Activity list/detail APIs return `401`.
- Activity belongs to another app user:
  - Detail API returns `404`.
- Activity id contains unexpected characters:
  - URL encode on link generation; validate as string on server.

## Test Plan

Unit/domain tests:

- Add dashboard helper test for Strava activity item href generation if extracted into `training-dashboard.ts`.

API tests are not currently wired with a Next route test harness, so minimally verify with build plus manual curl/browser checks.

Manual QA:

1. Register/login.
2. Connect Strava.
3. Open dashboard.
4. Confirm Recent activity shows stored Strava runs without pressing Sync.
5. Click Sync and confirm last-sync copy changes.
6. Click one Strava activity.
7. Confirm `/app/activities/strava/:id` opens.
8. Confirm the detail page shows the correct name, date, distance, duration, and HR values.
9. Refresh the dashboard.
10. Confirm activities remain visible and the app does not present the state as unsynced.

Verification commands:

```bash
npm test
npm run build
```

## Implementation Order

1. Schema and types:
   - Add sync metadata columns.
   - Update Supabase row types.
   - Add connection sync update helpers.

2. Server APIs:
   - Add activity detail lookup helper.
   - Add activity detail API route.
   - Change list route to include sync metadata.
   - Prefer adding POST sync route; otherwise keep `?sync=1` but still record metadata.

3. Dashboard:
   - Stop auto-syncing on every mount.
   - Render stored activities and last-sync status.
   - Link Strava rows to detail page.

4. Detail page:
   - Build `/app/activities/strava/[activityId]`.
   - Match existing dashboard/panel styling.

5. Plan import panel cleanup:
   - Separate "load stored" from "sync Strava".

6. Tests and QA:
   - Run `npm test`.
   - Run `npm run build`.
   - Manually verify dashboard, sync, detail navigation.

## Acceptance Criteria

- Clicking a Strava recent activity never opens a custom plan by default.
- Every Strava recent activity opens its own detail page.
- Refreshing the dashboard shows already-synced activities from Supabase.
- Dashboard does not call Strava on every page load unless the user explicitly clicks Sync or a future stale-sync policy is added.
- The UI clearly distinguishes:
  - connected
  - stored activities loaded
  - sync in progress
  - last synced
  - sync error
- Existing GPX/TCX import and plan matching still work.

