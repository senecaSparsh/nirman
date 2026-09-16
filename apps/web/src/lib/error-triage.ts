import crypto from "node:crypto";
import { prisma } from "@nirman/db";
import { createInAppNotification } from "@nirman/services";

/**
 * Error triage — turns raw ErrorLog rows into a fixable issue list.
 *
 * One ErrorLog row = one unique error signature (fingerprint). Repeat
 * occurrences update the row's count + latest sample instead of creating
 * noise. Resolving an error is verifiable: if the same signature recurs,
 * the row auto-reopens (reopenedCount++) so regressions surface instead
 * of disappearing.
 *
 * Sources:
 *   - "client" — ErrorCatcher in the root layout (window.onerror,
 *     unhandledrejection, console.error)
 *   - "server" — apiHandler's catch block for unhandled 500s
 *
 * New signatures notify every active DEVELOPER user via in-app
 * notification, once — repeats don't re-notify unless the issue was
 * resolved and reopened.
 */

export interface IncomingError {
  type: string;
  message: string;
  filename?: string | null;
  lineno?: number | null;
  colno?: number | null;
  stack?: string | null;
  url: string;
  userAgent?: string | null;
  userId?: string | null;
  companyId?: string | null;
  source?: "client" | "server";
  /** How many occurrences this call represents (batched client errors
   *  with the same fingerprint are collapsed into one recordError call). */
  occurrences?: number;
}

/** Strip volatile tokens so the same bug fingerprints identically across
 * users, ids, timestamps and minified bundle hashes. */
function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, "<uuid>")
    .replace(/\bc[a-z0-9]{20,}\b/g, "<cuid>")
    .replace(/\b\d{10,13}\b/g, "<ts>")
    .replace(/\b\d+(\.\d+)?\b/g, "<n>")
    .replace(/"[^"]*"|'[^']*'/g, "<str>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** First app-frame-ish stack line — more stable than filename:col which
 * shifts between Turbopack/webpack bundles. */
function topFrame(stack?: string | null, filename?: string | null): string {
  if (stack) {
    const line = stack.split("\n").find((l) => /\bat\b.*:\d+:\d+/.test(l));
    if (line) {
      return line
        .replace(/:\d+:\d+/g, "")
        .replace(/https?:\/\/[^/]+/g, "")
        .replace(/_next\/static\/chunks\/[^ )]+/g, "<chunk>")
        .trim()
        .slice(0, 200);
    }
  }
  return (filename ?? "").replace(/https?:\/\/[^/]+/g, "").replace(/:\d+:\d+$/g, "").slice(0, 200);
}

function normalizeUrlPath(url: string): string {
  try {
    const p = new URL(url, "https://x").pathname;
    // Replace id-like path segments so /m/sales/abc123 and /m/sales/def456 group together
    return p
      .split("/")
      .map((seg) => (/^[a-zA-Z0-9_-]{15,}$/.test(seg) || /^\d+$/.test(seg) ? "<id>" : seg))
      .join("/")
      .slice(0, 200);
  } catch {
    return String(url).slice(0, 200);
  }
}

export function fingerprintFor(e: IncomingError): string {
  const key = [
    e.source ?? "client",
    e.type,
    normalizeMessage(e.message),
    topFrame(e.stack, e.filename),
    normalizeUrlPath(e.url),
  ].join("|");
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/**
 * Record one error occurrence. If a row with the same fingerprint exists,
 * bump its count and refresh the latest sample; a resolved row reopens.
 * Returns { created } so callers can notify only on brand-new signatures.
 */
export async function recordError(e: IncomingError): Promise<{ id: string; created: boolean; reopened: boolean }> {
  const fp = fingerprintFor(e);
  const now = new Date();
  const sample = {
    type: String(e.type).slice(0, 40),
    message: String(e.message ?? "Unknown error").slice(0, 2000),
    filename: e.filename ? String(e.filename).slice(0, 500) : null,
    lineno: e.lineno ? Number(e.lineno) : null,
    colno: e.colno ? Number(e.colno) : null,
    stack: e.stack ? String(e.stack).slice(0, 5000) : null,
    url: String(e.url ?? "/").slice(0, 500),
    userAgent: e.userAgent ? String(e.userAgent).slice(0, 500) : null,
    userId: e.userId ?? null,
    companyId: e.companyId ?? null,
    source: e.source ?? "client",
  };

  const count = Math.max(1, e.occurrences ?? 1);
  const existing = await prisma.errorLog.findUnique({ where: { fingerprint: fp } });
  if (existing) {
    const reopened = existing.resolvedAt !== null;
    const updated = await prisma.errorLog.update({
      where: { id: existing.id },
      data: {
        ...sample,
        occurrenceCount: { increment: count },
        lastSeenAt: now,
        ...(reopened
          ? { resolvedAt: null, resolvedById: null, reopenedCount: { increment: 1 } }
          : {}),
      },
      select: { id: true },
    });
    return { id: updated.id, created: false, reopened };
  }

  const created = await prisma.errorLog.create({
    data: { ...sample, fingerprint: fp, occurrenceCount: count },
    select: { id: true },
  });
  return { id: created.id, created: true, reopened: false };
}

/**
 * Notify all active DEVELOPER users about a brand-new (or reopened)
 * error signature. Best-effort — never throws, never blocks the response.
 */
export async function notifyDevelopersOfError(input: {
  message: string;
  url: string;
  reopened?: boolean;
}): Promise<void> {
  try {
    const devs = await prisma.user.findMany({
      where: { role: "DEVELOPER", active: true },
      select: { id: true, companyId: true },
      take: 10,
    });
    const fallbackCompany = await prisma.company.findFirst({
      where: { deletedAt: null },
      select: { id: true },
    });
    await Promise.all(
      devs.map((d) => {
        const companyId = d.companyId ?? fallbackCompany?.id;
        if (!companyId) return Promise.resolve();
        return createInAppNotification({
          companyId,
          userId: d.id,
          eventType: input.reopened ? "error.regression" : "error.new_signature",
          title: input.reopened ? "Resolved error recurred" : "New error signature",
          message: `${input.message.slice(0, 180)} — at ${normalizeUrlPath(input.url)}`,
          link: "/dev/errors",
        }).catch(() => {});
      }),
    );
  } catch {
    // notification failure must never break error recording
  }
}
