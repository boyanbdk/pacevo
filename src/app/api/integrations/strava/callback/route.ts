import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/server/env";
import { getUserById, upsertStravaConnection } from "@/lib/server/integration-db";
import { exchangeAuthorizationCode } from "@/lib/server/strava";
import { encryptToken } from "@/lib/server/token-crypto";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const userId = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${appBaseUrl()}/app/settings?strava=denied`);
  }
  if (!code || !userId) {
    return NextResponse.json({ error: "Missing Strava callback code or state." }, { status: 400 });
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "Unknown user for Strava callback." }, { status: 400 });
  }

  const token = await exchangeAuthorizationCode(code);
  if (!token.athlete?.id) {
    return NextResponse.json({ error: "Strava did not return an athlete id." }, { status: 400 });
  }

  await upsertStravaConnection({
    userId: user.id,
    providerUserId: String(token.athlete.id),
    displayName: [token.athlete.firstname, token.athlete.lastname].filter(Boolean).join(" ") || token.athlete.username || null,
    scopes: token.scope?.split(/[,\s]+/).filter(Boolean) ?? [],
    accessTokenCiphertext: encryptToken(token.access_token),
    refreshTokenCiphertext: encryptToken(token.refresh_token),
    accessTokenExpiresAt: new Date(token.expires_at * 1000).toISOString(),
  });

  return NextResponse.redirect(`${appBaseUrl()}/app/settings?strava=connected`);
}

