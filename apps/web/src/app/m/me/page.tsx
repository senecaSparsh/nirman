"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  User,
  Monitor,
  Sun,
  Moon,
  Settings,
  LogOut,
  Wifi,
  WifiOff,
  RefreshCw,
  MoreHorizontal,
  ClipboardCheck,
} from "lucide-react";
import { useSession, signOut as authSignOut } from "@/lib/auth-client";
import { useFieldMode } from "@/lib/field-mode";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import {
  Card,
  MobileSectionTitle,
  MobileRow,
  Button,
  Badge,
} from "@/components/mobile/v2/primitives";

/**
 * Me page — profile, settings, and rehomed header features.
 *
 * This is where features that were removed from the minimal header now
 * live: desktop mode switcher, theme toggle, field mode, notifications,
 * and sign-out.
 */
export default function MePage() {
  const router = useRouter();
  useSession();
  const { enabled: fieldMode, toggle: toggleFieldMode } = useFieldMode();
  const { pending: offlineQueueCount, online, syncing, sync: syncOfflineQueue } = useOfflineQueue();
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.name) setUserName(d.name);
        if (d?.role) setUserRole(d.role);
      })
      .catch(() => {});
    fetch("/api/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (c?.name) setCompanyName(c.name);
      })
      .catch(() => {});
    const isDarkNow = document.documentElement.classList.contains("dark");
    setIsDark((prev) => (prev !== isDarkNow ? isDarkNow : prev));
  }, []);

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("nirman.theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("nirman.theme", "light");
    }
  };

  const handleSignOut = () => {
    authSignOut().catch(() => {});
    router.replace("/sign-in");
  };

  return (
    <div>
      {/* ── Profile card ──────────────────────────────────────────── */}
      <div className="mb-4">
        <Card className="p-4" style={{ borderLeftColor: "var(--color-signal)", borderLeftWidth: 4 }}>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full grid place-items-center shrink-0"
              style={{ backgroundColor: "var(--color-signal-wash)" }}
            >
              <User className="size-6" style={{ color: "var(--color-signal-dark)" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[1rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                {userName || "User"}
              </p>
              <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
                {userRole} · {companyName}
              </p>
            </div>
            <Badge tone="signal">{userRole}</Badge>
          </div>
        </Card>
      </div>

      {/* ── Sync status ───────────────────────────────────────────── */}
      <div className="mb-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {online ? (
                <Wifi className="size-4" style={{ color: "var(--color-go)" }} />
              ) : (
                <WifiOff className="size-4" style={{ color: "var(--color-stop)" }} />
              )}
              <span className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-900)" }}>
                {online ? "Online" : "Offline"}
              </span>
            </div>
            {offlineQueueCount > 0 ? (
              <Button variant="secondary" size="md" onClick={() => void syncOfflineQueue()} disabled={syncing}>
                <RefreshCw className={syncing ? "size-3.5 animate-spin" : "size-3.5"} />
                {syncing ? "Syncing…" : `Sync (${offlineQueueCount})`}
              </Button>
            ) : null}
          </div>
          {offlineQueueCount > 0 ? (
            <p className="text-[0.6875rem] mt-2" style={{ color: "var(--color-ink-500)" }}>
              {offlineQueueCount} action{offlineQueueCount === 1 ? "" : "s"} queued for sync
            </p>
          ) : null}
        </Card>
      </div>

      {/* ── Display settings ──────────────────────────────────────── */}
      <MobileSectionTitle>Display</MobileSectionTitle>
      <div>
        <button
          onClick={() => toggleFieldMode()}
          className="flex items-center gap-3 min-h-[3.5rem] px-4 border-b w-full press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <Sun className="size-4 shrink-0" style={{ color: fieldMode ? "var(--color-signal-dark)" : "var(--color-ink-500)" }} />
          <div className="flex-1 text-left">
            <p className="text-[0.9375rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
              Field Mode
            </p>
            <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
              Larger text for outdoor use
            </p>
          </div>
          <Badge tone={fieldMode ? "signal" : "neutral"}>
            {fieldMode ? "ON" : "OFF"}
          </Badge>
        </button>

        <button
          onClick={toggleDark}
          className="flex items-center gap-3 min-h-[3.5rem] px-4 border-b w-full press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          {isDark ? (
            <Moon className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
          ) : (
            <Sun className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
          )}
          <div className="flex-1 text-left">
            <p className="text-[0.9375rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
              Dark Mode
            </p>
            <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
              {isDark ? "On" : "Off"}
            </p>
          </div>
          <Badge tone={isDark ? "steel" : "neutral"}>
            {isDark ? "ON" : "OFF"}
          </Badge>
        </button>
      </div>

      {/* ── Navigation ────────────────────────────────────────────── */}
      <MobileSectionTitle>Switch view</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        <MobileRow
          href="/"
          icon={Monitor}
          title="Desktop ERP"
          subtitle="Full desktop view"
        />
        <MobileRow
          href="/m/pulse/approvals"
          icon={ClipboardCheck}
          title="Approvals Queue"
          subtitle="POs & requisitions"
        />
        <MobileRow
          href="/m/settings"
          icon={Settings}
          title="Settings"
          subtitle="Company, users, permissions"
        />
      </div>

      {/* ── More ──────────────────────────────────────────────────── */}
      <MobileSectionTitle>More</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        <MobileRow
          href="/m/settings"
          icon={MoreHorizontal}
          title="More"
          subtitle="Additional settings & options"
        />
      </div>

      {/* ── Sign out ──────────────────────────────────────────────── */}
      <div className="mt-6">
        <Button variant="danger" fullWidth size="lg" onClick={handleSignOut}>
          <LogOut className="size-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
