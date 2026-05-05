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

export async function POST() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Log in before syncing Strava activities." }, { status: 401 });
  }

  const connection = await getStravaConnectionForUser(user.id);
  if (!connection) {
    return NextResponse.json({
      connected: false,
      synced: 0,
      lastSyncedAt: null,
      lastSyncStartedAt: null,
      lastSyncError: null,
      activities: [],
      error: "Connect Strava in Settings first.",
    });
  }

  await markStravaSyncStarted(connection.id);

  try {
    const synced = await fetchAndStoreRecentStravaActivities(connection);
    await markStravaSyncSucceeded(connection.id);
    const latestConnection = await getStravaConnectionForUser(user.id);
    const activities = await listProviderActivitiesForUser(user.id);

    return NextResponse.json({
      connected: true,
      synced,
      ...stravaConnectionMetadata(latestConnection ?? connection),
      activities: activities.map(stravaActivityPayload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Strava sync failed.";
    await markStravaSyncFailed(connection.id, message);
    const latestConnection = await getStravaConnectionForUser(user.id);
    const activities = await listProviderActivitiesForUser(user.id);

    return NextResponse.json({
      connected: true,
      synced: 0,
      ...(latestConnection ? stravaConnectionMetadata(latestConnection) : stravaConnectionMetadata(connection)),
      activities: activities.map(stravaActivityPayload),
      error: message,
    });
  }
}
