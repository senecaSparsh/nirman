import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";

/**
 * GET /api/telephony/consent — get the current active consent policy for
 * the company (the one with no retiredAt date).
 * Requires CALL_VIEW.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.CALL_VIEW);
  const company = await getCompany();

  const policy = await prisma.consentPolicy.findFirst({
    where: { companyId: company.id, retiredAt: null },
    orderBy: { effectiveAt: "desc" },
    include: {
      _count: { select: { acceptances: true } },
    },
  });

  if (!policy) return json({ policy: null });

  return json({ policy });
});

/**
 * POST /api/telephony/consent — create or revise the consent policy.
 * Requires TELEPHONY_MANAGE.
 *
 * Auto-increments the version number and retires the previous active policy.
 *
 * Body: { policyText: string }
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.TELEPHONY_MANAGE);
  const company = await getCompany();

  const body = await req.json();
  const { policyText } = body as { policyText?: string };

  if (!policyText || typeof policyText !== "string" || !policyText.trim()) {
    return json({ error: "policyText is required" }, { status: 400 });
  }

  // Find the current active policy to get the next version number
  const current = await prisma.consentPolicy.findFirst({
    where: { companyId: company.id, retiredAt: null },
    orderBy: { version: "desc" },
  });

  const nextVersion = (current?.version ?? 0) + 1;

  // Retire the old policy and create the new one in a transaction
  const newPolicy = await prisma.$transaction(async (tx) => {
    if (current) {
      await tx.consentPolicy.update({
        where: { id: current.id },
        data: { retiredAt: new Date() },
      });
    }

    return tx.consentPolicy.create({
      data: {
        companyId: company.id,
        version: nextVersion,
        policyText: policyText.trim(),
        createdById: user.id,
      },
    });
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "CONSENT_POLICY_CREATE",
    entityType: "ConsentPolicy",
    entityId: newPolicy.id,
    after: { version: nextVersion },
  });

  return json(newPolicy, { status: 201 });
});
