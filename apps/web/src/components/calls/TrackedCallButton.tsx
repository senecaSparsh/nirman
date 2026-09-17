"use client";

import { useState } from "react";
import { Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

/**
 * TrackedCallButton — replaces raw `tel:` links on contact surfaces.
 *
 * Tap → POST /api/calls/originate → the platform calls the staff
 * member's own phone first, then bridges to the customer with the
 * staff member's number as caller ID. Every such call is logged +
 * recorded — the tracked path instead of an invisible native dial.
 *
 * If the company has no calling provider configured (or the staff user
 * has no phone), it falls back to a normal `tel:` dial so the button
 * never dead-ends.
 */
export function TrackedCallButton({
  phone,
  relatedCustomerId,
  relatedSupplierId,
  relatedProjectId,
  label = "Call",
  className,
  style,
  compact,
}: {
  phone: string;
  relatedCustomerId?: string;
  relatedSupplierId?: string;
  relatedProjectId?: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  /** compact = icon-only square button for list rows */
  compact?: boolean;
}) {
  const [calling, setCalling] = useState(false);

  async function placeTrackedCall() {
    haptic(10);
    setCalling(true);
    try {
      const res = await fetch("/api/calls/originate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toNumber: phone,
          relatedCustomerId,
          relatedSupplierId,
          relatedProjectId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Calling your phone — answer it to connect to the customer.");
        haptic();
      } else if (res.status === 503 || res.status === 400) {
        // No provider / no staff phone — fall back to a plain native call
        // so the button still dials rather than failing silently.
        toast.info(data.error ?? "Direct dialing — call won't be auto-tracked.");
        window.location.href = `tel:${phone}`;
      } else {
        toast.error(data.error ?? "Could not place the call");
      }
    } catch {
      toast.info("Network error — opening the phone dialer instead.");
      window.location.href = `tel:${phone}`;
    }
    setCalling(false);
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={placeTrackedCall}
        disabled={calling}
        aria-label={`Call ${phone}`}
        className={className ?? "grid place-items-center size-8 rounded-full press"}
        style={style ?? { backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
      >
        {calling ? <Loader2 className="size-3.5 animate-spin" /> : <Phone className="size-3.5" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={placeTrackedCall}
      disabled={calling}
      className={
        className ??
        "flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press"
      }
      style={style ?? { backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
    >
      {calling ? <Loader2 className="size-3.5 animate-spin" /> : <Phone className="size-3.5" />}
      {label}
    </button>
  );
}
