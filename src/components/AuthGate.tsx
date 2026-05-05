"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND_NAME } from "@/lib/brand";
import { currentUser } from "@/lib/auth-client";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    currentUser().then((user) => {
      if (!active) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (!ready) {
    return <div className="auth-page muted">Loading {BRAND_NAME}...</div>;
  }

  return children;
}
