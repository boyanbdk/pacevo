import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import {
  getStravaConnectionForUser,
  listProviderActivitiesForUser,
} from "@/lib/server/integration-db";
import { fetchAndStoreRecentStravaActivities } from "@/lib/server/strava";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sync = url.searchParams.get("sync") === "1";

  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Log in before loading Strava activities." }, { status: 401 });
  }

  const connection = await getStravaConnectionForUser(user.id);
  if (!connection) {
    return NextResponse.json({ connected: false, activities: [] });
  }

  let synced = 0;
  if (sync) {
    synced = await fetchAndStoreRecentStravaActivities(connection);
  }

  const activities = await listProviderActivitiesForUser(user.id);
  return NextResponse.json({
    connected: true,
    synced,
    activities: activities.map((activity) => ({
      id: `strava:${activity.provider_activity_id}`,
      source: "strava",
      fileName: "Strava",
      name: activity.name,
      startedAt: activity.started_at,
      date: activity.local_date,
      distanceKm: Number(activity.distance_km),
      durationMin: Number(activity.duration_min),
      avgHR: activity.avg_hr,
      maxHR: activity.max_hr,
    })),
  });
}
