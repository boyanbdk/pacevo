"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BRAND_ASSETS, BRAND_MOTTO, BRAND_NAME } from "@/lib/brand";
import {
  AuthClientError,
  currentUser,
  recoveryModeForAuthError,
  submitAuth,
  type AuthErrorCode,
} from "@/lib/auth-client";

type AuthMode = "login" | "register";

type AuthFailure = {
  code: AuthErrorCode;
  message: string;
};

const AUTH_COPY: Record<AuthMode, { heading: string; body: string; submit: string; pending: string }> = {
  login: {
    heading: "Welcome back",
    body: "Log in to continue your training workspace.",
    submit: "Log in",
    pending: "Logging in...",
  },
  register: {
    heading: "Create your Pacevo account",
    body: "Start with a private training workspace for plans, adaptations, and session feedback.",
    submit: "Create account",
    pending: "Creating account...",
  },
};

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const [activeMode, setActiveMode] = useState<AuthMode>(mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const isRegister = activeMode === "register";
  const copy = AUTH_COPY[activeMode];

  useEffect(() => {
    setActiveMode(mode);
    setPassword("");
    setFailure(null);
  }, [mode]);

  useEffect(() => {
    let active = true;

    currentUser()
      .then((user) => {
        if (!active) return;
        if (user) {
          setRedirecting(true);
          router.replace("/app");
          return;
        }
        setCheckingSession(false);
      })
      .catch(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, [router]);

  function switchMode(nextMode: AuthMode) {
    if (nextMode === activeMode) return;
    setActiveMode(nextMode);
    setPassword("");
    setFailure(null);
    window.history.replaceState(window.history.state, "", nextMode === "login" ? "/login" : "/register");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email || !password) return;
    setFailure(null);
    setSubmitting(true);
    try {
      await submitAuth(activeMode, email, password);
      router.push("/app");
    } catch (err) {
      if (err instanceof AuthClientError) {
        setFailure({ code: err.code, message: err.message });
      } else {
        setFailure({ code: "server_error", message: "Pacevo could not connect. Try again." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const recoveryMode = failure ? recoveryModeForAuthError(failure.code) : null;

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="brand-panel">
          <div className="brand-mark auth-brand-mark">
            <img src={BRAND_ASSETS.markDark} alt="" aria-hidden="true" />
          </div>
          <div className="hero-copy">
            <span className="card-kicker">{BRAND_MOTTO}</span>
            <h1>{BRAND_NAME}</h1>
            <p>Plan your race build, adapt each run to today, and learn from the feedback loop.</p>
          </div>
          <div className="metric-row auth-proof-row">
            <div className="metric">
              <strong>Plan</strong>
              <span>race-ready weeks</span>
            </div>
            <div className="metric">
              <strong>Adapt</strong>
              <span>today&apos;s readiness</span>
            </div>
            <div className="metric">
              <strong>Learn</strong>
              <span>feedback loop</span>
            </div>
          </div>
        </section>
        <form className="form-panel form-grid" onSubmit={submit}>
          {checkingSession || redirecting ? (
            <div className="auth-redirect-state" aria-live="polite">
              <span className="card-kicker">{BRAND_MOTTO}</span>
              <h2>Continuing to {BRAND_NAME}...</h2>
            </div>
          ) : (
            <>
              <div className="auth-mode-switch" role="group" aria-label="Choose account action">
                <button
                  type="button"
                  className={activeMode === "login" ? "selected" : ""}
                  aria-pressed={activeMode === "login"}
                  onClick={() => switchMode("login")}
                >
                  Log in
                </button>
                <button
                  type="button"
                  className={activeMode === "register" ? "selected" : ""}
                  aria-pressed={activeMode === "register"}
                  onClick={() => switchMode("register")}
                >
                  Create account
                </button>
              </div>
              <div>
                <h2>{copy.heading}</h2>
                <p className="muted">{copy.body}</p>
              </div>
              <div className="field">
                <label htmlFor={emailId}>Email</label>
                <input
                  className="input"
                  id={emailId}
                  type="email"
                  value={email}
                  autoComplete="email"
                  required
                  autoFocus
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor={passwordId}>Password</label>
                <input
                  className="input"
                  id={passwordId}
                  type="password"
                  value={password}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  required
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {failure && (
                <div className="auth-error plan-warn" aria-live="polite">
                  <span>{failure.message}</span>
                  {recoveryMode && (
                    <button className="auth-error-action" type="button" onClick={() => switchMode(recoveryMode)}>
                      {recoveryMode === "login" ? "Log in with this email" : "Create account with this email"}
                    </button>
                  )}
                </div>
              )}
              <button className="button primary" type="submit" disabled={submitting}>
                {submitting ? copy.pending : copy.submit}
              </button>
              <p className="muted auth-mode-fallback">
                {isRegister ? "Already have a Pacevo account? " : "New to Pacevo? "}
                <Link href={isRegister ? "/login" : "/register"} onClick={(event) => {
                  event.preventDefault();
                  switchMode(isRegister ? "login" : "register");
                }}>
                  {isRegister ? "Log in" : "Create account"}
                </Link>
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
