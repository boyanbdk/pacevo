"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveUser } from "@/lib/storage";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isRegister = mode === "register";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email || !password) return;
    saveUser(email);
    router.push("/app");
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="brand-panel">
          <div className="brand-mark">RT</div>
          <div className="hero-copy">
            <h1>Run Tailor</h1>
            <p>Convert a coach plan into a clear treadmill or outdoor execution card for how you feel today.</p>
          </div>
          <div className="metric-row">
            <div className="metric">
              <strong>1-10</strong>
              <span>readiness lane</span>
            </div>
            <div className="metric">
              <strong>km/h</strong>
              <span>pace converted</span>
            </div>
            <div className="metric">
              <strong>PNG</strong>
              <span>PDF and DOCX</span>
            </div>
          </div>
        </section>
        <form className="form-panel form-grid" onSubmit={submit}>
          <div>
            <h2>{isRegister ? "Create account" : "Log in"}</h2>
            <p className="muted">Local MVP account storage keeps the app gated on this device.</p>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input className="input" id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input className="input" id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <button className="button primary" type="submit">
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
