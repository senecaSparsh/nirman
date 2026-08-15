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
  Pencil,
  Check,
  X,
  Loader2,
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
import { toast } from "sonner";

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
  const [userEmail, setUserEmail] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.name) setUserName(d.name);
        if (d?.role) setUserRole(d.role);
        if (d?.email) setUserEmail(d.email);
        if (d?.phone) setUserPhone(d.phone);
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

  function startEditProfile() {
    setEditName(userName);
    setEditPhone(userPhone);
    setEditingProfile(true);
  }

  async function saveProfile() {
    if (!editName.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update profile");
      }
      setUserName(editName.trim());
      setUserPhone(editPhone.trim());
      setEditingProfile(false);
      toast.success("Profile updated");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  }

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

          {/* Profile details / edit form */}
          {editingProfile ? (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--color-line)" }}>
              <div className="space-y-2.5">
                <div>
                  <label className="text-[0.5625rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.875rem] font-medium outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                  />
                </div>
                <div>
                  <label className="text-[0.5625rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="—"
                    className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.875rem] font-medium outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="secondary" size="md" onClick={() => setEditingProfile(false)} disabled={savingProfile}>
                  <X className="size-3.5" />
                  Cancel
                </Button>
                <Button variant="primary" size="md" onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--color-line)" }}>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
                    {userEmail || "—"}
                  </p>
                  <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
                    {userPhone || "No phone"}
                  </p>
                </div>
                <button
                  onClick={startEditProfile}
                  className="flex items-center gap-1 rounded-[0.375rem] px-2.5 py-1.5 text-[0.625rem] font-bold press active:scale-95"
                  style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
                >
                  <Pencil className="size-3" />
                  Edit
                </button>
              </div>
            </div>
          )}
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
              <div className="flex gap-2">
                <Button variant="secondary" size="md" onClick={() => router.push("/m/queue")}>
                  View Queue ({offlineQueueCount})
                </Button>
                <Button variant="secondary" size="md" onClick={() => void syncOfflineQueue()} disabled={syncing}>
                  <RefreshCw className={syncing ? "size-3.5 animate-spin" : "size-3.5"} />
                  {syncing ? "Syncing…" : "Sync"}
                </Button>
              </div>
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
