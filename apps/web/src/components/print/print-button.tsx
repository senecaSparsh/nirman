"use client";

import { useState, useRef, useCallback } from "react";
import {
  Printer,
  FileDown,
  ImageDown,
  Loader2,
  Share2,
} from "lucide-react";

/**
 * ═══════════════════════════════════════════════════════════════════
 * PRINT TOOLBAR — unified print/download/share bar for all print pages.
 *
 * Provides four actions:
 *   1. Print          — opens the browser print dialog (Ctrl+P equivalent)
 *   2. Download PDF   — uses browser print-to-PDF (most reliable, no lib)
 *   3. Download Image — captures the .print-page element as PNG via html-to-image
 *   4. Share          — uses Web Share API (mobile) or copies image to clipboard
 *
 * The toolbar is `print:hidden` so it doesn't appear on the printed output.
 * It auto-detects the `.print-page` element on the page for image capture.
 * ═══════════════════════════════════════════════════════════════════
 */

type DownloadFormat = "pdf" | "png";

export function PrintToolbar({
  title = "Document",
}: {
  title?: string;
}) {
  const [busy, setBusy] = useState<DownloadFormat | "share" | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  /** Find the .print-page element (the actual document content). */
  const getPrintElement = useCallback((): HTMLElement | null => {
    return document.querySelector(".print-page");
  }, []);

  // ── Print (browser dialog) ──
  const handlePrint = () => window.print();

  // ── Download as PDF (browser print-to-PDF) ──
  const handleDownloadPdf = () => {
    setBusy("pdf");
    window.print();
    setTimeout(() => setBusy(null), 1500);
  };

  // ── Download as PNG image ──
  const handleDownloadImage = async () => {
    const el = getPrintElement();
    if (!el) return;
    setBusy("png");
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(el, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        filter: (node) => {
          // Skip the toolbar itself and any print:hidden elements
          if (node instanceof HTMLElement) {
            if (node === toolbarRef.current) return false;
            if (node.closest(".print:hidden")) return false;
            if (node.closest("[data-print-exclude]")) return false;
          }
          return true;
        },
      });
      const link = document.createElement("a");
      const safeName = title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      link.download = `${safeName}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Image download failed:", err);
      // Fallback: just print
      window.print();
    } finally {
      setBusy(null);
    }
  };

  // ── Share (Web Share API with image, or fallback to print) ──
  const handleShare = async () => {
    const el = getPrintElement();
    if (!el) return;
    setBusy("share");
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(el, {
        quality: 0.9,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        filter: (node) => {
          if (node instanceof HTMLElement) {
            if (node === toolbarRef.current) return false;
            if (node.closest(".print:hidden")) return false;
          }
          return true;
        },
      });

      // Convert dataURL to Blob for Web Share API
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `${title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.png`, {
        type: "image/png",
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title,
          text: `${title} — Nirman Inventory`,
          files: [file],
        });
      } else if (navigator.share) {
        // Fallback: share without file
        await navigator.share({
          title,
          text: `${title} — Nirman Inventory`,
        });
      } else {
        // No Web Share API — copy image to clipboard
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        alert("Image copied to clipboard! Paste it anywhere.");
      }
    } catch (err) {
      console.error("Share failed:", err);
      // Fallback: trigger print
      window.print();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      ref={toolbarRef}
      data-print-exclude
      className="print:hidden sticky top-0 z-50 flex items-center justify-end gap-0.5 border-b border-gray-200 bg-white px-4 py-2"
    >
      <button
        type="button"
        onClick={handlePrint}
        title="Print"
        className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors"
      >
        <Printer className="h-3.5 w-3.5" />
        Print
      </button>

      <button
        type="button"
        onClick={handleDownloadPdf}
        disabled={busy !== null}
        title="Save as PDF"
        className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
      >
        {busy === "pdf" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileDown className="h-3.5 w-3.5" />
        )}
        PDF
      </button>

      <button
        type="button"
        onClick={handleDownloadImage}
        disabled={busy !== null}
        title="Download as image"
        className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
      >
        {busy === "png" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ImageDown className="h-3.5 w-3.5" />
        )}
        Image
      </button>

      <button
        type="button"
        onClick={handleShare}
        disabled={busy !== null}
        title="Share"
        className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
      >
        {busy === "share" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Share2 className="h-3.5 w-3.5" />
        )}
        Share
      </button>
    </div>
  );
}

/**
 * Legacy PrintButton — kept for backward compatibility.
 * New print pages should use <PrintToolbar /> instead.
 */
export function PrintButton({
  label = "Print",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ??
        "rounded-md bg-black px-6 py-2 text-sm font-medium text-white hover:bg-gray-800"
      }
    >
      {label}
    </button>
  );
}

/**
 * Legacy GeneratePdfButton — kept for backward compatibility.
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
    window.print();
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
