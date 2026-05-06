import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import {
  getStravaConnectionForUser,
  listProviderActivitiesForUser,
} from "@/lib/server/integration-db";
import { stravaActivityPayload, stravaConnectionMetadata } from "@/lib/server/strava-activity-payload";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Log in before loading Strava activities." }, { status: 401 });
  }
  if (url.searchParams.get("sync") === "1") {
    return NextResponse.json(
      { error: "Use POST /api/integrations/strava/activities/sync to sync Strava activities." },
      { status: 400 },
    );
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

  const activities = await listProviderActivitiesForUser(user.id);
  return NextResponse.json({
    connected: true,
    synced: 0,
    ...stravaConnectionMetadata(connection),
    activities: activities.map(stravaActivityPayload),
  });
}
