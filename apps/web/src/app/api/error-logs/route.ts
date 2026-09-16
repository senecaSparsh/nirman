import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";
import {
  fingerprintFor,
  notifyDevelopersOfError,
  recordError,
  type IncomingError,
} from "@/lib/error-triage";

/**
 * POST /api/error-logs — batch client-side errors from the ErrorCatcher.
 *
 * Body: {
 *   errors: Array<{
 *     type: "error" | "unhandledrejection" | "console.error",
 *     message: string,
 *     filename?: string,
 *     lineno?: number,
 *     colno?: number,
 *     stack?: string,
 *     url: string,
 *     timestamp: string,
 *   }>
 * }
 *
 * Any authenticated user can submit error logs — this is a client-side
 * telemetry endpoint. Errors are deduplicated by fingerprint: one row per
 * unique signature, repeat hits bump occurrenceCount/lastSeenAt. A new
 * signature notifies every DEVELOPER user once.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  let user;
  try {
    user = await requireUser();
  } catch {
    user = null;
  }

  let company;
  try {
    company = user ? await getCompany() : null;
  } catch {
    company = null;
  }

  let body: { errors?: Array<Record<string, unknown>> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.errors || !Array.isArray(body.errors) || body.errors.length === 0) {
    return json({ error: "No errors provided." }, { status: 400 });
  }

  // Cap batch size to prevent abuse
  const batch = body.errors.slice(0, 50);
  const userAgent = req.headers.get("user-agent") ?? null;

  // Collapse the batch by fingerprint — 50 identical errors are one row update.
  const groups = new Map<string, { rep: IncomingError; count: number }>();
  for (const e of batch) {
    const incoming: IncomingError = {
      type: String(e.type ?? "error"),
      message: String(e.message ?? "Unknown error"),
      filename: e.filename ? String(e.filename) : null,
      lineno: e.lineno ? Number(e.lineno) : null,
      colno: e.colno ? Number(e.colno) : null,
      stack: e.stack ? String(e.stack) : null,
      url: String(e.url ?? "/"),
      userAgent,
      userId: user?.id ?? null,
      companyId: company?.id ?? null,
      source: "client",
    };
    const fp = fingerprintFor(incoming);
    const g = groups.get(fp);
    if (g) g.count += 1;
    else groups.set(fp, { rep: incoming, count: 1 });
  }

  let newSignatures = 0;
  let reopened = 0;
  for (const { rep, count } of groups.values()) {
    try {
      const res = await recordError({ ...rep, occurrences: count });
      if (res.created) {
        newSignatures += 1;
        await notifyDevelopersOfError({ message: rep.message, url: rep.url });
      } else if (res.reopened) {
        reopened += 1;
        await notifyDevelopersOfError({ message: rep.message, url: rep.url, reopened: true });
      }
    } catch {
      // Recording must never fail the telemetry endpoint
    }
  }

  return json({ status: "ok", signatures: groups.size, newSignatures, reopened }, { status: 201 });
}, {
  // Telemetry must work for anonymous sessions too — a crash on the
  // sign-in page is exactly the error you most want captured. Rate
  // limiting still applies (write preset), batch capped at 50.
  skipSession: true,
});

/**
 * GET /api/error-logs — list error signatures (DEVELOPER only).
 *
 * Query params:
 *   - status: open (default) | resolved | all
 *   - type: error | unhandledrejection | console.error | server
 *   - source: client | server
 *   - q: substring match on message
 *   - limit: number (default 50, max 200)
 *   - offset: number (default 0)
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  if (user.role !== "DEVELOPER") {
    return json({ error: "Forbidden — only the developer can view error logs." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? undefined;
  const source = searchParams.get("source") ?? undefined;
  const status = searchParams.get("status") ?? "open";
  const q = searchParams.get("q")?.trim() ?? "";
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50;
  const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0;

  const where = {
    ...(type ? { type } : {}),
    ...(source ? { source } : {}),
    ...(status === "open" ? { resolvedAt: null } : status === "resolved" ? { resolvedAt: { not: null } } : {}),
    ...(q ? { message: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [errors, total, openCount] = await Promise.all([
    prisma.errorLog.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      take: Math.min(limit, 200),
      skip: offset,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        company: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.errorLog.count({ where }),
    prisma.errorLog.count({ where: { resolvedAt: null } }),
  ]);

  return json({ errors, total, openCount, limit, offset });
});

/**
 * PATCH /api/error-logs — triage an error signature (DEVELOPER only).
 *
 * Body: { id: string, action: "resolve" | "reopen" }
 * Resolving marks the signature fixed; if it recurs it auto-reopens.
 */
export const PATCH = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  if (user.role !== "DEVELOPER") {
    return json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    action?: string;
  } | null;
  if (!body?.id || (body.action !== "resolve" && body.action !== "reopen")) {
    return json({ error: "Expected { id, action: 'resolve' | 'reopen' }" }, { status: 400 });
  }

  const updated =
    body.action === "resolve"
      ? await prisma.errorLog.update({
          where: { id: body.id },
          data: { resolvedAt: new Date(), resolvedById: user.id },
          select: { id: true, resolvedAt: true },
        })
      : await prisma.errorLog.update({
          where: { id: body.id },
          data: { resolvedAt: null, resolvedById: null },
          select: { id: true, resolvedAt: true },
        });

  return json({ ok: true, error: updated });
});
