import { NextResponse } from "next/server";
import { AuthError, loginWithPassword } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json(
        { code: "missing_credentials", error: "Email and password are required." },
        { status: 400 },
      );
    }
    const user = await loginWithPassword(body.email, body.password);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { code: "server_error", error: error instanceof Error ? error.message : "Could not log in." },
      { status: 500 },
    );
  }
}
