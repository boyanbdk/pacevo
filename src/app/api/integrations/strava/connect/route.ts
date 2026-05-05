import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { stravaAuthorizationUrl } from "@/lib/server/strava";

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Log in before connecting Strava." }, { status: 401 });
  }

  return NextResponse.redirect(stravaAuthorizationUrl(user.id));
}
