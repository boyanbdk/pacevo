import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user });
}
