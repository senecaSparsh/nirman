"use client";

import * as React from "react";
import { MapPin, CheckCircle2, AlertTriangle, Loader2, Clock, LogOut } from "lucide-react";

/**
 * MobileSelfCheckIn — a self-service attendance check-in/check-out button
 * for field workers. Uses the browser's Geolocation API to capture GPS
 * coordinates and posts to /api/attendance/self-check-in and
 * /api/attendance/self-check-out.
 *
 * Shows geofence status after check-in (within radius / outside radius).
 * After check-out, shows hours worked.
 */
export function MobileSelfCheckIn({
  employeeId,
  employeeName,
  hasCheckedIn,
  checkInTime,
  hasCheckedOut: initialCheckedOut,
  checkOutTime: initialCheckOutTime,
  hoursWorked: initialHoursWorked,
}: {
  employeeId: string;
  employeeName: string;
  hasCheckedIn: boolean;
  checkInTime?: string | null;
  hasCheckedOut?: boolean;
  checkOutTime?: string | null;
  hoursWorked?: number | null;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [geoStatus, setGeoStatus] = React.useState<{ ok: boolean | null; distance: number | null; location: string | null } | null>(null);
  const [checkedIn, setCheckedIn] = React.useState(hasCheckedIn);
  const [checkedOut, setCheckedOut] = React.useState(initialCheckedOut ?? false);
  const [checkOutTime, setCheckOutTime] = React.useState(initialCheckOutTime ?? null);
  const [hoursWorked, setHoursWorked] = React.useState<number | null>(initialHoursWorked ?? null);

  async function getPosition() {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    });
  }

  async function handleCheckIn() {
    setLoading(true);
    setError(null);
    try {
      const position = await getPosition();

      const res = await fetch("/api/attendance/self-check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          date: new Date().toISOString(),
          checkInLat: position.coords.latitude,
          checkInLng: position.coords.longitude,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Check-in failed");
      }

      const data = await res.json();
      setGeoStatus({
        ok: data.geoFenceOk ?? null,
        distance: data.geoFenceDistance ?? null,
        location: data.reportingLocation ?? null,
      });
      setCheckedIn(true);
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        setError("Could not get your location. Please enable GPS and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Check-in failed");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckOut() {
    setLoading(true);
    setError(null);
    try {
      const position = await getPosition();

      const res = await fetch("/api/attendance/self-check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          date: new Date().toISOString(),
          checkOutLat: position.coords.latitude,
          checkOutLng: position.coords.longitude,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Check-out failed");
      }

      const data = await res.json();
      setCheckedOut(true);
      setCheckOutTime(new Date().toTimeString().slice(0, 5));
      setHoursWorked(data.hoursWorked ?? null);
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        setError("Could not get your location. Please enable GPS and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Check-out failed");
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Checked out state — show full summary ──
  if (checkedIn && checkedOut) {
    return (
      <div
        className="rounded-xl p-3 flex items-center gap-3"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-green-500) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--color-green-500) 20%, transparent)",
        }}
      >
        <CheckCircle2 className="size-5 shrink-0" style={{ color: "var(--color-green-600)" }} />
        <div className="flex-1 min-w-0">
          <p className="text-m-section font-semibold" style={{ color: "var(--color-ink-900)" }}>
            Day complete
          </p>
          <p className="text-m-body" style={{ color: "var(--color-ink-600)" }}>
            {checkInTime} → {checkOutTime} · {employeeName}
          </p>
          {hoursWorked != null && (
            <p className="text-m-label font-medium mt-0.5" style={{ color: "var(--color-ink-700)" }}>
              {hoursWorked}h worked
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Checked in but not checked out — show check-out button ──
  if (checkedIn) {
    return (
      <div className="space-y-2">
        <div
          className="rounded-xl p-3 flex items-center gap-3"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-green-500) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-green-500) 20%, transparent)",
          }}
        >
          <CheckCircle2 className="size-5 shrink-0" style={{ color: "var(--color-green-600)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-m-section font-semibold" style={{ color: "var(--color-ink-900)" }}>
              Checked in
            </p>
            <p className="text-m-body" style={{ color: "var(--color-ink-600)" }}>
              {checkInTime ?? "Today"} · {employeeName}
            </p>
            {geoStatus?.ok === false && (
              <p className="text-m-label font-medium mt-0.5 flex items-center gap-1" style={{ color: "var(--color-amber-600)" }}>
                <AlertTriangle className="size-3" />
                Outside site geofence ({geoStatus.distance}m away)
              </p>
            )}
            {geoStatus?.ok === true && (
              <p className="text-m-label font-medium mt-0.5 flex items-center gap-1" style={{ color: "var(--color-green-600)" }}>
                <MapPin className="size-3" />
                At {geoStatus.location ?? "site"}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleCheckOut}
          disabled={loading}
          className="w-full rounded-xl py-3 px-4 flex items-center justify-center gap-2 font-semibold text-m-section transition-all active:scale-[0.98] disabled:opacity-50"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-red-500) 10%, transparent)",
            color: "var(--color-red-600)",
            border: "1px solid color-mix(in srgb, var(--color-red-500) 25%, transparent)",
            minHeight: 56,
          }}
        >
          {loading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <LogOut className="size-5" />
          )}
          {loading ? "Checking out..." : "Check Out"}
        </button>
        {error && (
          <p className="text-m-body text-center" style={{ color: "var(--color-red-600)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── Not checked in — show check-in button ──
  return (
    <div>
      <button
        onClick={handleCheckIn}
        disabled={loading}
        className="w-full rounded-xl py-3 px-4 flex items-center justify-center gap-2 font-semibold text-m-section transition-all active:scale-[0.98] disabled:opacity-50"
        style={{
          backgroundColor: "var(--color-primary)",
          color: "white",
          minHeight: 56,
        }}
      >
        {loading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Clock className="size-5" />
        )}
        {loading ? "Checking in..." : "Check In"}
      </button>
      {error && (
        <p className="text-m-body mt-2 text-center" style={{ color: "var(--color-red-600)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
