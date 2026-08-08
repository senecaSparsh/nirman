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
    maximumFractionDigits: 0,
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
