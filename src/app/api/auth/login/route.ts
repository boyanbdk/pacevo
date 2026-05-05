import { NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }
    const user = await loginWithPassword(body.email, body.password);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not log in." },
      { status: 401 },
    );
  }
}

