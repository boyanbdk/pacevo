"use client";

import { Activity, CalendarRange, Home, LogOut, Plus, Scissors, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearUser } from "@/lib/storage";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = [
    { href: "/app", label: "Dashboard", icon: Home },
    { href: "/app/new", label: "New workout", icon: Plus },
    { href: "/app/tailoring", label: "Tailor workout", icon: Scissors },
    { href: "/app/plans", label: "Training plans", icon: CalendarRange },
  ];

  function signOut() {
    clearUser();
    router.push("/login");
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link href="/app" className="logo-row">
          <span className="brand-mark">RT</span>
          <span>Run Tailor</span>
        </Link>
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} className={pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href)) ? "active" : ""} href={item.href}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="nav sidebar-bottom-nav">
          <Link href="/app/settings" className={pathname.startsWith("/app/settings") ? "active" : ""}>
            <Settings size={18} />
            Settings
          </Link>
          <button onClick={signOut}>
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>
      <div>
        <div className="mobile-topbar">
          <Link href="/app" className="logo-row">
            <span className="brand-mark">RT</span>
            <span>Run Tailor</span>
          </Link>
          <Link className="button ghost" href="/app/new" aria-label="New workout">
            <Activity size={18} />
          </Link>
        </div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
