import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { normalizePhone } from "@/lib/phone-otp";
import { logAction } from "@nirman/services";

/**
 * Mask a phone number, showing only the last 4 digits.
 * e.g. "919876543210" → "*****3210"
 */
function maskNumber(num: string): string {
  if (!num || num.length <= 4) return num;
  return "*".repeat(num.length - 4) + num.slice(-4);
}

/**
 * GET /api/calls — list call logs with filters.
 *
 * Query params:
 *   page, limit          — pagination (default 1, 50)
 *   direction            — INBOUND | OUTBOUND | INTERNAL
 *   status               — RINGING | ANSWERED | MISSED | BUSY | REJECTED | FAILED | VOICEMAIL
 *   staffId              — filter by callerUserId
 *   companyPhoneId       — filter by company phone number
 *   tag                  — filter by tag name
 *   search               — search by phone number (fromNumber or toNumber)
 *   fromDate, toDate     — date range (ISO strings, filters startedAt)
 *
 * Permissions:
 *   CALL_VIEW required.
 *   If user has CALL_VIEW_ALL → sees all company calls.
 *   Otherwise → only their own calls (callerUserId = user.id).
 *
 * Number masking: if user lacks CALL_VIEW_FULL_NUMBER, the non-company
 * party number is masked (last 4 digits visible).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.CALL_VIEW);
  const company = await getCompany();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const direction = url.searchParams.get("direction");
  const status = url.searchParams.get("status");
  const staffId = url.searchParams.get("staffId");
  const companyPhoneId = url.searchParams.get("companyPhoneId");
  const tag = url.searchParams.get("tag");
  const search = url.searchParams.get("search");
  const fromDate = url.searchParams.get("fromDate");
  const toDate = url.searchParams.get("toDate");

  // Permission scope: CALL_VIEW_ALL → all company calls, else own calls only
  const { getUserPermissions } = await import("@/lib/server");
  const perms = await getUserPermissions();
  const canViewAll = perms.includes(PERM.CALL_VIEW_ALL);
  const canViewFullNumber = perms.includes(PERM.CALL_VIEW_FULL_NUMBER);

  const where: Record<string, unknown> = {
    companyId: company.id,
    deletedAt: null,
  };

  if (!canViewAll) {
    where.OR = [{ callerUserId: user.id }, { calleeUserId: user.id }];
  }

  if (direction) where.direction = direction;
  if (status) where.status = status;
  if (staffId) where.callerUserId = staffId;
  if (companyPhoneId) where.companyPhoneId = companyPhoneId;

  if (fromDate || toDate) {
    const startedAt: Record<string, unknown> = {};
    if (fromDate) startedAt.gte = new Date(fromDate);
    if (toDate) startedAt.lte = new Date(toDate);
    where.startedAt = startedAt;
  }

  if (search) {
    const normalized = normalizePhone(search);
    where.OR = [
      { fromNumber: { contains: normalized } },
      { toNumber: { contains: normalized } },
    ];
  }

  if (tag) {
    where.tags = { some: { callTag: { name: tag, companyId: company.id } } };
  }

  const [calls, total] = await Promise.all([
    prisma.callLog.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        companyPhone: { select: { id: true, phoneNumber: true, label: true } },
        caller: { select: { id: true, name: true } },
        callee: { select: { id: true, name: true } },
        recording: { select: { id: true, format: true, durationSec: true, storageUrl: true } },
        voicemail: { select: { id: true, durationSec: true } },
        tags: { include: { callTag: { select: { id: true, name: true, color: true } } } },
        _count: { select: { callNotes: true } },
      },
    }),
    prisma.callLog.count({ where }),
  ]);

  // Apply number masking if the user lacks CALL_VIEW_FULL_NUMBER
  const maskedCalls = canViewFullNumber
    ? calls
    : calls.map((c) => {
        // Determine which number is the company number — mask the other party
        const companyNum = c.companyPhone?.phoneNumber ?? "";
        const companyNorm = normalizePhone(companyNum);
        const fromIsCompany = c.fromNumber === companyNorm;
        return {
          ...c,
          fromNumber: fromIsCompany ? c.fromNumber : maskNumber(c.fromNumber),
          toNumber: !fromIsCompany ? c.toNumber : maskNumber(c.toNumber),
        };
      });

  return json({ data: maskedCalls, total, page, limit });
});

/**
 * POST /api/calls — manually log a call.
 *
 * Accepts two formats:
 *
 * 1. Simple (from the UI form):
 *    { direction, otherNumber, companyPhoneId?, durationSec?, disposition?, notes? }
 *    The API derives fromNumber/toNumber from direction + companyPhone + otherNumber.
 *    Status is auto-derived: ANSWERED if durationSec > 0, else MISSED.
 *    startedAt defaults to now.
 *
 * 2. Full (from webhooks or advanced forms):
 *    { direction, fromNumber, toNumber, companyPhoneId?, status, startedAt, ... }
 *
 * Requires CALL_CREATE. Sets source = "MANUAL".
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.CALL_CREATE);
  const company = await getCompany();

  const body = await req.json();
  const {
    direction,
    fromNumber: rawFromNumber,
    toNumber: rawToNumber,
    otherNumber,
    companyPhoneId,
    status: rawStatus,
    startedAt: rawStartedAt,
    connectedAt,
    endedAt,
    durationSec,
    ringDurationSec,
    disposition,
    notes,
    callCost,
    relatedCustomerId,
    relatedSupplierId,
    relatedProjectId,
    recordingConsent,
  } = body as {
    direction?: string;
    fromNumber?: string;
    toNumber?: string;
    otherNumber?: string;
    companyPhoneId?: string;
    status?: string;
    startedAt?: string;
    connectedAt?: string;
    endedAt?: string;
    durationSec?: number;
    ringDurationSec?: number;
    disposition?: string;
    notes?: string;
    callCost?: number;
    relatedCustomerId?: string;
    relatedSupplierId?: string;
    relatedProjectId?: string;
    recordingConsent?: boolean;
  };

  if (!direction) {
    return json({ error: "Direction is required" }, { status: 400 });
  }

  // Validate direction is one of the allowed values
  const validDirections = ["INBOUND", "OUTBOUND", "INTERNAL"];
  if (!validDirections.includes(direction)) {
    return json({ error: `Direction must be one of: ${validDirections.join(", ")}` }, { status: 400 });
  }

  // ── Resolve fromNumber / toNumber ──
  let fromNumber = rawFromNumber;
  let toNumber = rawToNumber;

  // If using the simple format (otherNumber), derive from/to from direction
  if (!fromNumber && !toNumber && otherNumber) {
    const companyPhone = companyPhoneId
      ? await prisma.companyPhone.findFirst({
          where: { id: companyPhoneId, companyId: company.id, deletedAt: null },
          select: { phoneNormalized: true },
        })
      : null;
    const companyNum = companyPhone?.phoneNormalized ?? "unknown";
    const otherNorm = normalizePhone(otherNumber);
    if (direction === "OUTBOUND") {
      fromNumber = companyNum;
      toNumber = otherNorm;
    } else if (direction === "INBOUND") {
      fromNumber = otherNorm;
      toNumber = companyNum;
    } else {
      // INTERNAL — both are staff, just use otherNumber as the other party
      fromNumber = companyNum;
      toNumber = otherNorm;
    }
  }

  if (!fromNumber || !toNumber) {
    return json({ error: "Could not determine call parties. Provide otherNumber or fromNumber/toNumber." }, { status: 400 });
  }

  // ── Derive status ──
  const status = rawStatus ?? ((durationSec ?? 0) > 0 ? "ANSWERED" : "MISSED");
  const startedAt = rawStartedAt ?? new Date().toISOString();
  const endedAtResolved = endedAt ?? (durationSec ? new Date(new Date(startedAt).getTime() + durationSec * 1000).toISOString() : undefined);
  const connectedAtResolved = connectedAt ?? ((durationSec ?? 0) > 0 ? startedAt : undefined);

  // Validate companyPhoneId belongs to this company
  if (companyPhoneId) {
    const phone = await prisma.companyPhone.findFirst({
      where: { id: companyPhoneId, companyId: company.id, deletedAt: null },
    });
    if (!phone) return json({ error: "Company phone number not found" }, { status: 404 });
  }

  const call = await prisma.callLog.create({
    data: {
      companyId: company.id,
      direction,
      fromNumber: normalizePhone(fromNumber),
      toNumber: normalizePhone(toNumber),
      companyPhoneId: companyPhoneId ?? null,
      callerUserId: user.id,
      status,
      startedAt: new Date(startedAt),
      connectedAt: connectedAtResolved ? new Date(connectedAtResolved) : null,
      endedAt: endedAtResolved ? new Date(endedAtResolved) : null,
      durationSec: durationSec ?? 0,
      ringDurationSec: ringDurationSec ?? 0,
      disposition: disposition ?? null,
      notes: notes ?? null,
      callCost: callCost ?? null,
      relatedCustomerId: relatedCustomerId ?? null,
      relatedSupplierId: relatedSupplierId ?? null,
      relatedProjectId: relatedProjectId ?? null,
      recordingConsent: recordingConsent ?? false,
      provider: "MANUAL",
      source: "MANUAL",
    },
    include: {
      companyPhone: { select: { id: true, phoneNumber: true, label: true } },
      caller: { select: { id: true, name: true } },
      recording: { select: { id: true } },
    },
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "CALL_LOG_CREATE",
    entityType: "CallLog",
    entityId: call.id,
    after: { direction, status, fromNumber, toNumber },
  });

  return json(call, { status: 201 });
});
