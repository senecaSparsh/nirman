"use client";

import { useState } from "react";
import { Share2, Check, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Native Web Share API button with clipboard fallback.
 *
 * Uses `navigator.share` when available (mobile browsers, some
 * desktop browsers). Falls back to `navigator.clipboard.writeText`
 * with a toast confirmation when Web Share isn't supported.
 *
 * Also provides a WhatsApp fallback link that opens wa.me with
 * pre-filled text — works on both mobile and desktop.
 */
export function ShareButton({
  title,
  text,
  url,
  whatsappNumber,
  variant = "outline",
  size = "sm",
  label = "Share",
  className,
}: {
  title?: string;
  text: string;
  url?: string;
  /** Optional WhatsApp number (with country code, no +) for wa.me link. */
  whatsappNumber?: string;
  variant?: "default" | "outline" | "ghost" | "secondary" | "brand";
  size?: "sm" | "default" | "touch";
  label?: string;
  className?: string;
}) {
  const [shared, setShared] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullText = [title, text, url].filter(Boolean).join("\n");

  async function handleShare() {
    // Try Web Share API first
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: title ?? "Share",
          text,
          url,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(fullText);
        setCopied(true);
        toast.success("Copied to clipboard", {
          description: "Paste into WhatsApp, email, or any app.",
        });
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch {
        // Clipboard also failed — try WhatsApp link
      }
    }

    // Last resort: open WhatsApp
    if (whatsappNumber) {
      const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(fullText)}`;
      window.open(waUrl, "_blank");
    } else {
      toast.error("Sharing not supported on this device");
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleShare}
      className={className}
    >
      {shared ? (
        <Check className="h-3.5 w-3.5" />
      ) : copied ? (
        <LinkIcon className="h-3.5 w-3.5" />
      ) : (
        <Share2 className="h-3.5 w-3.5" />
      )}
      {shared ? "Shared" : copied ? "Copied" : label}
    </Button>
  );
}

/**
 * WhatsApp share link — opens wa.me with pre-filled text.
 * Use when you specifically want WhatsApp (not the general share sheet).
 */
export function WhatsAppShareLink({
  text,
  url,
  number,
  className,
  children,
}: {
  text: string;
  url?: string;
  number?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const fullText = url ? `${text}\n${url}` : text;
  const waUrl = number
    ? `https://wa.me/${number}?text=${encodeURIComponent(fullText)}`
    : `https://wa.me/?text=${encodeURIComponent(fullText)}`;

  return (
    <a
      href={waUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children ?? "Share on WhatsApp"}
    </a>
  );
}
