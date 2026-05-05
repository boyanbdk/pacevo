import { clearUser, saveUser, type LocalUser } from "./storage";

export type AuthErrorCode =
  | "missing_credentials"
  | "invalid_credentials"
  | "account_exists"
  | "account_not_found"
  | "server_error";

type AuthResponse = {
  user?: LocalUser | null;
  error?: string;
  code?: AuthErrorCode;
};

export class AuthClientError extends Error {
  code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthClientError";
    this.code = code;
  }
}

export function authErrorMessage(code: AuthErrorCode, fallback?: string): string {
  switch (code) {
    case "missing_credentials":
      return "Enter your email and password to continue.";
    case "account_exists":
      return "That email already has a Pacevo account. Log in instead.";
    case "account_not_found":
      return "No Pacevo account exists for that email. Create one instead.";
    case "invalid_credentials":
      return fallback ?? "Incorrect email or password.";
    case "server_error":
      return "Pacevo could not connect. Try again.";
  }
}

export function recoveryModeForAuthError(code: AuthErrorCode): "login" | "register" | null {
  if (code === "account_exists") return "login";
  if (code === "account_not_found") return "register";
  return null;
}

async function parseAuthResponse(response: Response): Promise<AuthResponse> {
  const body = await response.json() as AuthResponse;
  if (!response.ok) {
    const code = body.code ?? "server_error";
    throw new AuthClientError(code, authErrorMessage(code, body.error));
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
