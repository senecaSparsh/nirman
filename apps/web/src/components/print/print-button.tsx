"use client";

import { useState } from "react";
import { Printer, FileDown, Loader2 } from "lucide-react";

/**
 * Print button — must be a Client Component because it uses onClick.
 * Provides both "Print" (opens browser print dialog) and "Generate PDF"
 * (triggers print dialog with PDF save hint) actions.
 */
export function PrintButton({ label = "Print", className }: { label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={className ?? "rounded-md bg-black px-6 py-2 text-sm font-medium text-white hover:bg-gray-800"}
    >
      {label}
    </button>
  );
}

/**
 * Generate PDF button — uses the browser's built-in print-to-PDF
 * capability. On click, opens the print dialog where the user can
 * select "Save as PDF" as the destination. This is the most reliable
 * cross-platform approach without requiring a heavy PDF library.
 */
export function GeneratePdfButton({
  label = "Generate PDF",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const [generating, setGenerating] = useState(false);

  function handleGeneratePdf() {
    setGenerating(true);
    // Trigger the browser's print dialog — the user selects "Save as PDF"
    // as the destination. This is the standard approach for client-side
    // PDF generation without external libraries.
    window.print();
    // Reset state after a short delay (the print dialog blocks execution)
    setTimeout(() => setGenerating(false), 1000);
  }

  return (
    <button
      type="button"
      onClick={handleGeneratePdf}
      disabled={generating}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
      }
    >
      {generating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileDown className="h-4 w-4" />
      )}
      {label}
    </button>
  );
}

/**
 * Print + PDF button group — shows both buttons side by side.
 */
export function PrintActions({
  printLabel = "Print",
  pdfLabel = "Generate PDF",
}: {
  printLabel?: string;
  pdfLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        <Printer className="h-4 w-4" />
        {printLabel}
      </button>
      <GeneratePdfButton label={pdfLabel} />
    </div>
  );
}
