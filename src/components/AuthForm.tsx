"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BRAND_ASSETS, BRAND_MOTTO, BRAND_NAME } from "@/lib/brand";
import { submitAuth } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isRegister = mode === "register";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      await submitAuth(mode, email, password);
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

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
          <div className="metric-row">
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
          <div>
            <h2>{isRegister ? "Create account" : "Log in"}</h2>
            <p className="muted">Your account is checked against the app database.</p>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input className="input" id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input className="input" id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          {error && <div className="plan-warn">{error}</div>}
          <button className="button primary" type="submit" disabled={submitting}>
            {isRegister ? "Create account" : "Log in"}
          </button>
          <p className="muted">
            {isRegister ? "Already have a local account? " : "New here? "}
            <Link href={isRegister ? "/login" : "/register"}>{isRegister ? "Log in" : "Register"}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
