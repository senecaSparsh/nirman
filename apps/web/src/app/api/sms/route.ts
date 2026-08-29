import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { ingestSms, ingestSmsBatch, getSmsStats } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/sms — list bank SMS records + stats
 * Query params: ?status=MATCHED|UNMATCHED|IGNORED
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const [smsRecords, stats] = await Promise.all([
    prisma.bankSms.findMany({
      where: {
        companyId: company.id,
        ...(status ? { status } : {}),
      },
      orderBy: { receivedAt: "desc" },
      take: 100,
    }),
    getSmsStats(company.id),
  ]);

  return json({
    stats,
    items: smsRecords.map((s) => ({
      id: s.id,
      sender: s.sender,
      message: s.message,
      receivedAt: s.receivedAt.toISOString(),
      amount: s.amount ? toNum(s.amount) : null,
      upiRef: s.upiRef,
      bankName: s.bankName,
      txnType: s.txnType,
      counterparty: s.counterparty,
      status: s.status,
      matchedEntityType: s.matchedEntityType,
      matchedEntityId: s.matchedEntityId,
      paymentRecordId: s.paymentRecordId,
      matchConfidence: s.matchConfidence ? toNum(s.matchConfidence) : null,
      matchReason: s.matchReason,
    })),
  });
});

/**
 * POST /api/sms — ingest one or more SMS messages
 * Body: { messages: [{ sender, message, receivedAt? }] }
 *       or single: { sender, message, receivedAt? }
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const company = await getCompany();
  const body = await req.json();

  // Support both single and batch
  const messages = Array.isArray(body.messages) ? body.messages : [body];

  if (messages.length === 0) {
    return json({ error: "No messages provided" }, { status: 400 });
  }

  const results = await ingestSmsBatch(
    messages.map((m: { sender: string; message: string; receivedAt?: string }) => ({
      companyId: company.id,
      sender: m.sender,
      message: m.message,
      receivedAt: m.receivedAt ? new Date(m.receivedAt) : undefined,
      userId: user.id,
    })),
  );

  const matched = results.filter((r) => r.status === "MATCHED").length;
  const duplicates = results.filter((r) => r.duplicate).length;

  return json({
    results,
    summary: {
      total: results.length,
      matched,
      unmatched: results.filter((r) => r.status === "UNMATCHED").length,
      ignored: results.filter((r) => r.status === "IGNORED").length,
      duplicates,
    },
  }, { status: 201 });
});
