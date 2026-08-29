"use client";

import { useState } from "react";
import { ScanLine } from "lucide-react";
import { BarcodeScanner } from "@/components/mobile/barcode-scanner";

/**
 * ScanButton — a compact button that opens the barcode scanner.
 * On successful scan, calls onScan with the scanned code.
 *
 * Usage:
 *   <ScanButton onScan={(code) => setSearchQuery(code)} />
 */
export function ScanButton({
  onScan,
  label = "Scan",
  className = "",
}: {
  onScan: (code: string) => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`press flex items-center justify-center gap-1.5 rounded-[0.625rem] shrink-0 ${className}`}
        style={{
          minHeight: "2.5rem",
          padding: "0 0.75rem",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-ink-700)",
          border: "1px solid var(--color-line)",
        }}
        aria-label={label}
      >
        <ScanLine className="size-4" />
        {label ? <span className="text-m-caption font-semibold">{label}</span> : null}
      </button>
      {open ? (
        <BarcodeScanner
          onScan={(code) => {
            onScan(code);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
