import { NextResponse } from "next/server";
import { findOrCreateUserByEmail } from "@/lib/server/integration-db";
import { stravaAuthorizationUrl } from "@/lib/server/strava";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Missing email query parameter." }, { status: 400 });
  }

  const user = await findOrCreateUserByEmail(email);
  return NextResponse.redirect(stravaAuthorizationUrl(user.id));
}

