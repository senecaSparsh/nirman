"use client";

import { useState } from "react";
import { Printer, Share2, Loader2 } from "lucide-react";

/**
 * Action buttons for the mobile receipt detail page:
 *  - Print: opens the print-friendly receipt page in a new tab (where the
 *    user can use the browser's print / save-as-PDF).
 *  - Share: uses the Web Share API (WhatsApp / email / copy) when available,
 *    falling back to copying the print URL to the clipboard.
 */
export function ReceiptActions({
  printUrl,
  shareTitle,
  shareText,
}: {
  printUrl: string;
  shareTitle: string;
  shareText: string;
}) {
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  function handlePrint() {
    window.open(printUrl, "_blank", "noopener,noreferrer");
  }

  async function handleShare() {
    setSharing(true);
    try {
      const url = `${window.location.origin}${printUrl}`;
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareText, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        window.open(printUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      // user cancelled or share failed — no-op
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={handlePrint}
        className="flex items-center justify-center gap-1.5 rounded-[0.625rem] bg-black px-4 py-2.5 text-[0.875rem] font-semibold text-white press active:scale-95"
      >
        <Printer className="size-4" />
        Print / PDF
      </button>
      <button
        type="button"
        onClick={handleShare}
        className="flex items-center justify-center gap-1.5 rounded-[0.625rem] border px-4 py-2.5 text-[0.875rem] font-semibold press active:scale-95"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-900)" }}
      >
        {sharing ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
        {copied ? "Link Copied" : "Share"}
      </button>
    </div>
  );
}
