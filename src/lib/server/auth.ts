import crypto from "node:crypto";
import { cookies } from "next/headers";
import {
  createAuthSession,
  findOrCreateUserByEmail,
  getActiveAuthSession,
  getUserByEmail,
  getUserById,
  revokeAuthSession,
  updateUserPassword,
  type AppUserRow,
} from "./integration-db";

const SESSION_COOKIE = "run_tailor_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("base64");
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actualHash = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
}

function publicUser(user: AppUserRow) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.created_at,
  };
}

async function setSessionCookie(userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await createAuthSession({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt: expiresAt.toISOString(),
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function registerWithPassword(email: string, password: string) {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const existing = await getUserByEmail(email);
  if (existing?.password_hash) {
    throw new Error("An account with this email already exists.");
  }

  const user = existing ?? await findOrCreateUserByEmail(email);
  const salt = crypto.randomBytes(16).toString("base64url");
  const updated = await updateUserPassword(user.id, hashPassword(password, salt), salt);
  await setSessionCookie(updated.id);
  return publicUser(updated);
}

export async function loginWithPassword(email: string, password: string) {
  const user = await getUserByEmail(email);
  if (!user?.password_hash || !user.password_salt) {
    throw new Error("No account exists for that email.");
  }
  if (!verifyPassword(password, user.password_salt, user.password_hash)) {
    throw new Error("Incorrect email or password.");
  }

  await setSessionCookie(user.id);
  return publicUser(user);
}

export async function currentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await getActiveAuthSession(hashSessionToken(token));
  if (!session) return null;

  const user = await getUserById(session.user_id);
  return user ? publicUser(user) : null;
}

export async function logoutCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await revokeAuthSession(hashSessionToken(token));
  }
  cookieStore.delete(SESSION_COOKIE);
}

