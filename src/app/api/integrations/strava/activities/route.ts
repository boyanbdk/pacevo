import { NextResponse } from "next/server";
import {
  findOrCreateUserByEmail,
  getStravaConnectionForUser,
  listProviderActivitiesForUser,
} from "@/lib/server/integration-db";
import { fetchAndStoreRecentStravaActivities } from "@/lib/server/strava";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const sync = url.searchParams.get("sync") === "1";

  if (!email) {
    return NextResponse.json({ error: "Missing email query parameter." }, { status: 400 });
  }

  const user = await findOrCreateUserByEmail(email);
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

