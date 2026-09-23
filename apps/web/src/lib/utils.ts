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

/**
 * Today's date as a "YYYY-MM-DD" string in the LOCAL timezone.
 *
 * `localDateISO()` returns the UTC date — which is a day
 * behind the local date for the first (UTC-offset) hours of each day. E.g. at
 * 02:00 IST (UTC+5:30) on Sep 14, `toISOString()` still says "2026-09-13" while
 * the local calendar already reads Sep 14. Forms defaulting "today" via
 * `toISOString()` write records under the wrong business date and appear
 * "missing" to any query that buckets by local date (attendance rail, DPR feed).
 *
 * `toLocaleDateString("en-CA")` returns `YYYY-MM-DD` in local time — the
 * business "today" a field user means.
 */
export function localDateISO(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA");
}

export function cn(...inputs: ClassValue[]) {
  return twMergeCustom(clsx(inputs));
}

/**
 * Currency mode — "compact" shows ₹1.2L / ₹3.5Cr, "detailed" shows
 * ₹1,20,000.00.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  HOW IT WORKS — no call site ever needs to pass the mode
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Client: CurrencyProvider calls `setGlobalCurrencyMode()` on mount
 *  and on every toggle. `formatCurrency()` reads this module-level
 *  variable automatically.
 *
 *  Server: The root layout wraps the entire app in a currency-mode
 *  context via `runWithCurrencyMode()` (from `@/lib/currency-server`).
 *  That sets an AsyncLocalStorage store that `formatCurrency()` checks
 *  via a callback registered at startup. This means EVERY server-side
 *  `formatCurrency()` call — in any page, any component, now or in the
 *  future — automatically respects the user's preference without
 *  passing a parameter.
 *
 *  The explicit `mode` parameter is kept only for edge cases
 *  (e.g. forcing detailed format in a GL reconciliation view).
 * ═══════════════════════════════════════════════════════════════════
 */
export type CurrencyMode = "compact" | "detailed";

// ── Server-side request-scoped storage ─────────────────────────────
// The server module (@/lib/currency-server) registers a function here
// that returns the current AsyncLocalStorage store. This indirection
// keeps `node:async_hooks` out of the client bundle — utils.ts is
// imported by both server and client components, so it cannot import
// node builtins directly.
type ServerModeGetter = () => CurrencyMode | undefined;
let serverModeGetter: ServerModeGetter | null = null;

/**
 * Called once at server startup by currency-server.ts to wire up the
 * AsyncLocalStorage bridge. Client-side code never calls this.
 */
export function registerServerModeGetter(getter: ServerModeGetter) {
  serverModeGetter = getter;
}

// ── Client-side global (set by CurrencyProvider) ───────────────────
// Defaults to "compact" so KPIs, stats, and badges show ₹1.2L
// instead of ₹1,20,000.00. CurrencyProvider updates this on mount
// from the user's stored preference.
let globalCurrencyMode: CurrencyMode = "compact";

/** Set the global currency mode (called by CurrencyProvider on the client). */
export function setGlobalCurrencyMode(mode: CurrencyMode) {
  globalCurrencyMode = mode;
}

/** Get the current global currency mode (useful for testing / debugging). */
export function getGlobalCurrencyMode(): CurrencyMode {
  return globalCurrencyMode;
}

export function formatCurrency(
  value: number | string | null | undefined,
  currency = "INR",
  mode?: CurrencyMode,
) {
  // Priority: explicit parameter > server ALS (per-request) > client global
  const effectiveMode = mode ?? (serverModeGetter?.() ?? globalCurrencyMode);
  if (effectiveMode === "compact") return formatCurrencyCompact(value, currency);
  // Default and "detailed" both use the full format
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

/** "BANK_TRANSFER" → "Bank Transfer"; keeps acronyms (UPI, NEFT, RTGS) intact. */
export function formatEnumLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const ACRONYMS = new Set(["UPI", "NEFT", "RTGS", "IMPS", "GST", "EMI", "POS", "ATM", "BBPS", "ATS", "BBA", "BOQ", "DPR", "NCR", "PO", "WO", "HR", "IT", "KYC", "PF", "ESI", "UAN", "PAN", "TDS", "RERA", "BHK", "RK", "OTP", "SMS", "IVR", "GPS", "NOC", "MB", "GRN", "HSN", "SAC", "LR", "DO", "GR", "CC", "MEP", "HVAC", "QC", "QA", "WIP", "LOI", "AFS"]);
  return value
    .split(/[_\s-]+/)
    .map((w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}
export const formatPaymentMode = formatEnumLabel;

/** "0 9 * * *" → "Daily at 9:00 AM"; falls back to the raw expr for exotic schedules. */
export function humanizeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return `Scheduled: ${cron}`;
  const [min, hour, dom, , dow] = parts;
  const fmtHour = (h: number, m: number) => {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };
  const m = /^[0-9]+$/.test(min ?? "") ? Number(min) : null;
  const h = /^[0-9]+$/.test(hour ?? "") ? Number(hour) : null;
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (m !== null && h !== null && dom === "*" && dow === "*") return `Daily at ${fmtHour(h, m)}`;
  if (m !== null && h !== null && dom === "*" && /^[0-6]$/.test(dow ?? "")) return `Every ${DAYS[Number(dow)]} at ${fmtHour(h, m)}`;
  if (m !== null && h !== null && dow === "*" && /^[0-9]+$/.test(dom ?? "")) return `Monthly on day ${dom} at ${fmtHour(h, m)}`;
  return `Scheduled: ${cron}`;
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

/** Short date format: "15 Jan" — no year. Timezone-fixed for SSR safety. */
export function formatDateShort(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

/** Date + time format: "15 Jan 2024 · 14:30" — timezone-fixed for SSR safety. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  const date = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(d);
  const time = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(d);
  return `${date} · ${time}`;
}

/** Time-only format: "14:30" — timezone-fixed for SSR safety. */
export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
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

/**
 * Convert a raw audit log action code (e.g. "MATERIAL_ISSUE_CREATE") into a
 * human-readable label (e.g. "Material issue created"). Used in activity feeds
 * so users don't see technical codes.
 */
/** Past-tense label for workflow actions in toasts — "submit"→"submitted",
 *  "approve"→"approved", etc. Replaces the `${action}ed` pattern that produced
 *  "submited"/"approveed"/"confirmExited". */
export function actionPastTense(action: string): string {
  const MAP: Record<string, string> = {
    submit: "submitted", approve: "approved", reject: "rejected",
    resubmit: "resubmitted", cancel: "cancelled", delete: "deleted",
    verify: "verified", confirmExit: "exit confirmed", pay: "paid",
    issue: "issued", complete: "completed", close: "closed",
    investigate: "marked under investigation", review: "sent for review",
    start: "started", corrective_done: "corrective action done",
    preventive_done: "preventive action done", mitigate: "mitigated",
    resolve: "resolved", escalate: "escalated", assign: "assigned",
    acknowledge: "acknowledged", snooze: "snoozed",
  };
  return MAP[action] ?? `${action}ed`;
}

export function humanizeAuditAction(action: string): string {
  // Special cases with irregular verbs
  const SPECIAL: Record<string, string> = {
    DPR_SUB_ADMIN_APPROVE: "DPR sub-admin approved",
    DPR_ADMIN_APPROVE: "DPR admin approved",
    DPR_REJECT: "DPR rejected",
    DPR_RESUBMIT: "DPR resubmitted",
    DPR_COST_POSTED: "DPR cost posted",
    DPR_GENERATE_MATERIAL_ISSUE: "Material issue generated from DPR",
    PAYROLL_GENERATE: "Payroll generated",
    PAYROLL_LINE_ADJUST: "Payroll line adjusted",
    PAYROLL_PROCESS: "Payroll processed",
    PAYROLL_PAID: "Payroll paid",
    RENT_ESCALATION_APPLIED: "Rent escalation applied",
    RENT_SCHEDULE_GENERATE: "Rent schedule generated",
    RENT_AGREEMENT_UPLOAD: "Rent agreement uploaded",
    TENANCY_DRAFT_UPLOAD: "Tenancy draft uploaded",
    TENANT_CHANGE: "Tenant changed",
    BANK_SMS_INGESTED: "Bank SMS ingested",
    BANK_SMS_MANUAL_MATCH: "Bank SMS manually matched",
    SCHEDULE_PAYMENT_RECORD: "Scheduled payment recorded",
    LAND_UNPARTITION: "Land un-partitioned",
    USER_ROLE_CHANGE: "User role changed",
    USER_ACTIVATE: "User activated",
    USER_DEACTIVATE: "User deactivated",
  };
  if (SPECIAL[action]) return SPECIAL[action];

  // Generic: split on underscore, map known verbs to past tense
  const parts = action.toLowerCase().split("_");
  const verbMap: Record<string, string> = {
    create: "created",
    update: "updated",
    delete: "deleted",
    approve: "approved",
    reject: "rejected",
    cancel: "cancelled",
    submit: "submitted",
    convert: "converted",
    receive: "received",
    order: "ordered",
    issue: "issued",
    transfer: "transferred",
    sell: "sold",
    pay: "paid",
    record: "recorded",
    activate: "activated",
    terminate: "terminated",
    complete: "completed",
    upload: "uploaded",
    log: "logged",
    generate: "generated",
    assign: "assigned",
    return: "returned",
    retire: "retired",
    confirm: "confirmed",
    reconcile: "reconciled",
    waive: "waived",
    select: "selected",
    partition: "partitioned",
    valuate: "valuated",
    possess: "possession marked",
    escalate: "escalated",
    adjust: "adjusted",
    process: "processed",
    resubmit: "resubmitted",
    add: "added",
    change: "changed",
    post: "posted",
    ingest: "ingested",
    match: "matched",
    revoke: "revoked",
  };

  // Last part is usually the verb
  const verb = parts[parts.length - 1] ?? "";
  const subject = parts.slice(0, -1).join(" ");
  const pastTense = verbMap[verb] ?? verb;

  return `${subject} ${pastTense}`.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}
/**
 * displayEmail — phone-login accounts get a synthetic email
 * (`phone+91…@nirman.internal`) that is not a real mailbox. Returns null for
 * synthetic addresses so UIs show the phone (or "—") instead of a broken
 * mailto: link.
 */
export function displayEmail(email: string | null | undefined): string | null {
  if (!email || email.endsWith("@nirman.internal")) return null;
  return email;
}
