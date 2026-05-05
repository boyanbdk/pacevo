import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import {
  getStravaConnectionForUser,
  listProviderActivitiesForUser,
  markStravaSyncFailed,
  markStravaSyncStarted,
  markStravaSyncSucceeded,
} from "@/lib/server/integration-db";
import { fetchAndStoreRecentStravaActivities } from "@/lib/server/strava";
import { stravaActivityPayload, stravaConnectionMetadata } from "@/lib/server/strava-activity-payload";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sync = url.searchParams.get("sync") === "1";

  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Log in before loading Strava activities." }, { status: 401 });
  }

  const connection = await getStravaConnectionForUser(user.id);
  if (!connection) {
    return NextResponse.json({
      connected: false,
      lastSyncedAt: null,
      lastSyncStartedAt: null,
      lastSyncError: null,
      activities: [],
    });
  }

  let synced = 0;
  if (sync) {
    await markStravaSyncStarted(connection.id);
    try {
      synced = await fetchAndStoreRecentStravaActivities(connection);
      await markStravaSyncSucceeded(connection.id);
    } catch (error) {
      await markStravaSyncFailed(connection.id, error instanceof Error ? error.message : "Strava sync failed.");
      const activities = await listProviderActivitiesForUser(user.id);
      return NextResponse.json({
        connected: true,
        synced: 0,
        ...stravaConnectionMetadata({
          ...connection,
          last_sync_error: error instanceof Error ? error.message : "Strava sync failed.",
        }),
        activities: activities.map(stravaActivityPayload),
        error: error instanceof Error ? error.message : "Strava sync failed.",
      });
    }
  }

  const latestConnection = sync ? await getStravaConnectionForUser(user.id) : connection;
  const activities = await listProviderActivitiesForUser(user.id);
  return NextResponse.json({
    connected: true,
    synced,
    ...stravaConnectionMetadata(latestConnection ?? connection),
    activities: activities.map(stravaActivityPayload),
  });
}
