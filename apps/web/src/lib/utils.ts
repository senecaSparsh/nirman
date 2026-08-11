import { clsx, type ClassValue } from "clsx";
import { createTailwindMerge, getDefaultConfig } from "tailwind-merge";

/**
 * Custom twMerge that understands the design system's semantic font-size
 * utilities.
 *
 * The design system defines font-size utilities in globals.css via
 * `@utility` (text-micro, text-caption, text-meta, text-body, text-title,
 * text-label, text-figure, text-figure-lg, text-section). tailwind-merge
 * sees the `text-*` prefix and assumes these are text-COLOR utilities, so
 * it strips `text-primary-foreground` / `text-white` off buttons that also
 * carry one of these size classes — producing invisible black text on dark
 * button backgrounds. Adding a validator to the `font-size` group makes
 * twMerge treat them as sizes (which don't conflict with colors) so both
 * coexist correctly.
 */
const CUSTOM_FONT_SIZES = new Set([
  "micro",
  "caption",
  "meta",
  "body",
  "title",
  "label",
  "figure",
  "figure-lg",
  "section",
]);

const twMergeCustom = createTailwindMerge(() => {
  const config = getDefaultConfig();
  // The font-size group is [{ text: [themeId, ...validators] }].
  // Append a validator that matches our custom @utility font-size classes
  // so twMerge recognizes them as sizes, not text colors. The default config
  // types are readonly, so we cast to a mutable shape to extend the tuple.
  const fontSizeGroup = config.classGroups["font-size"] as unknown as {
    text: unknown[];
  }[];
  const entry = fontSizeGroup[0];
  if (entry) {
    entry.text = [
      ...entry.text,
      (suffix: string) => CUSTOM_FONT_SIZES.has(suffix),
    ];
  }
  return config;
});

export function cn(...inputs: ClassValue[]) {
  return twMergeCustom(clsx(inputs));
}

export function formatCurrency(value: number | string | null | undefined, currency = "INR") {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Compact currency format — Indian lakhs/crores notation (₹1.2L, ₹3.5Cr).
 * Use for KPI cards, dashboard stats, summary badges, and other display-only
 * contexts where full numbers would add visual noise.
 */
export function formatCurrencyCompact(value: number | string | null | undefined, currency = "INR") {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const symbol = currency === "INR" ? "₹" : "";
  if (abs >= 1_00_00_000) {
    // ≥ 1 crore
    const cr = abs / 1_00_00_000;
    return `${sign}${symbol}${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(2)}Cr`;
  }
  if (abs >= 1_00_000) {
    // ≥ 1 lakh
    const l = abs / 1_00_000;
    return `${sign}${symbol}${l % 1 === 0 ? l.toFixed(0) : l.toFixed(2)}L`;
  }
  if (abs >= 1_000) {
    // ≥ 1 thousand — show as ₹1.2K
    const k = abs / 1_000;
    return `${sign}${symbol}${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  // < 1000 — show whole rupees
  return `${sign}${symbol}${Math.round(abs).toLocaleString("en-IN")}`;
}

/**
 * Detailed currency format — shows paise (2 decimal places). Use for
 * GL entries, audit logs, invoices, reconciliation views, and any
 * financial context where hidden paise could cause phantom
 * reconciliation discrepancies.
 */
export function formatCurrencyDetailed(value: number | string | null | undefined, currency = "INR") {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatNumber(value: number | string | null | undefined, digits = 2) {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(n);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return formatDate(date);
}
