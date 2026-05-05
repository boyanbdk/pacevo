import { NextResponse } from "next/server";
import {
  getConnectionForStravaOwner,
  fetchAndStoreStravaActivity,
  verifyStravaWebhookSignature,
} from "@/lib/server/strava";
import { markWebhookEventProcessed, recordWebhookEvent } from "@/lib/server/integration-db";

type StravaWebhookEvent = {
  object_type?: string;
  object_id?: number;
  aspect_type?: "create" | "update" | "delete";
  owner_id?: number;
  event_time?: number;
  subscription_id?: number;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && verifyToken === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN && challenge) {
    return NextResponse.json({ "hub.challenge": challenge });
  }

  return NextResponse.json({ error: "Invalid webhook verification request." }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyStravaWebhookSignature(rawBody, request.headers.get("x-strava-signature"))) {
    return NextResponse.json({ error: "Invalid Strava webhook signature." }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as StravaWebhookEvent;
  const eventId = [
    event.subscription_id ?? "subscription",
    event.owner_id ?? "owner",
    event.object_type ?? "object",
    event.object_id ?? "id",
    event.aspect_type ?? "aspect",
    event.event_time ?? Date.now(),
  ].join(":");

  await recordWebhookEvent({
    providerEventId: eventId,
    providerUserId: event.owner_id ? String(event.owner_id) : null,
    providerActivityId: event.object_id ? String(event.object_id) : null,
    aspectType: event.aspect_type ?? "unknown",
    payload: event,
  });

  try {
    if (event.object_type === "activity" && event.aspect_type !== "delete" && event.owner_id && event.object_id) {
      const connection = await getConnectionForStravaOwner(String(event.owner_id));
      if (connection) {
        await fetchAndStoreStravaActivity(connection, String(event.object_id));
      }
    }
    await markWebhookEventProcessed(eventId);
  } catch (error) {
    await markWebhookEventProcessed(eventId, error instanceof Error ? error.message : "Unknown webhook processing error.");
  }

  return NextResponse.json({ ok: true });
}

