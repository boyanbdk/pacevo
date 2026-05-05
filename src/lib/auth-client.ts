import { clearUser, saveUser, type LocalUser } from "./storage";

type AuthResponse = {
  user?: LocalUser | null;
  error?: string;
};

async function parseAuthResponse(response: Response): Promise<AuthResponse> {
  const body = await response.json() as AuthResponse;
  if (!response.ok) {
    throw new Error(body.error ?? "Authentication failed.");
  }
  return body;
}

export async function currentUser(): Promise<LocalUser | null> {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  if (response.status === 401) {
    clearUser();
    return null;
  }
  const body = await parseAuthResponse(response);
  if (body.user?.email) {
    saveUser(body.user.email, body.user.createdAt);
    return body.user;
  }
  clearUser();
  return null;
}

export async function submitAuth(mode: "login" | "register", email: string, password: string): Promise<LocalUser> {
  const response = await fetch(`/api/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await parseAuthResponse(response);
  if (!body.user?.email) throw new Error("Authentication did not return a user.");
  saveUser(body.user.email, body.user.createdAt);
  return body.user;
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  clearUser();
}

