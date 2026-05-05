import { NextResponse } from "next/server";
import { logoutCurrentSession } from "@/lib/server/auth";

export async function POST() {
  await logoutCurrentSession();
  return NextResponse.json({ ok: true });
}

