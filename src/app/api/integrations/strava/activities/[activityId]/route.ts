import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { getProviderActivityForUser, setProviderActivityImportedAt } from "@/lib/server/integration-db";
import { stravaActivityDetailPayload } from "@/lib/server/strava-activity-payload";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Log in before loading Strava activity details." }, { status: 401 });
  }

  const { activityId } = await params;
  const decodedActivityId = decodeURIComponent(activityId);
  const activity = await getProviderActivityForUser(user.id, decodedActivityId);
  if (!activity) {
    return NextResponse.json({ error: "Strava activity not found." }, { status: 404 });
  }

  return NextResponse.json({ activity: stravaActivityDetailPayload(activity) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Log in before updating Strava activity details." }, { status: 401 });
  }

  const { activityId } = await params;
  const decodedActivityId = decodeURIComponent(activityId);
  const body = await request.json().catch(() => ({})) as { importedIntoPlan?: boolean };
  const importedAt = body.importedIntoPlan === false ? null : new Date().toISOString();
  const activity = await setProviderActivityImportedAt(user.id, decodedActivityId, importedAt);
  if (!activity) {
    return NextResponse.json({ error: "Strava activity not found." }, { status: 404 });
  }

  return NextResponse.json({ activity: stravaActivityDetailPayload(activity) });
}
