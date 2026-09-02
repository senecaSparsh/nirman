import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";
import { headers } from "next/headers";

/**
 * POST /api/telephony/consent/accept — staff accepts the current consent policy.
 * Requires only requireUser() (any authenticated staff member).
 *
 * Creates a ConsentAcceptance row (upsert — one per user per policy).
 * Also updates User.monitoringConsentAcceptedAt and
 * monitoringConsentPolicyId.
 */
export const POST = apiHandler(async (_req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();

  // Find the current active policy
  const policy = await prisma.consentPolicy.findFirst({
    where: { companyId: company.id, retiredAt: null },
    orderBy: { effectiveAt: "desc" },
  });

  if (!policy) {
    return json({ error: "No active consent policy found for this company" }, { status: 404 });
  }

  // Get request metadata for the acceptance log
  const hdrs = await headers();
  const ipAddress = hdrs.get("x-forwarded-for") ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;

  // Upsert the acceptance (unique constraint on [consentPolicyId, userId])
  const acceptance = await prisma.consentAcceptance.upsert({
    where: {
      consentPolicyId_userId: {
        consentPolicyId: policy.id,
        userId: user.id,
      },
    },
    update: {
      acceptedAt: new Date(),
      ipAddress,
      userAgent,
    },
    create: {
      consentPolicyId: policy.id,
      userId: user.id,
      acceptedAt: new Date(),
      ipAddress,
      userAgent,
    },
  });

  // Update the user's monitoring consent fields
  await prisma.user.update({
    where: { id: user.id },
    data: {
      monitoringConsentAcceptedAt: new Date(),
      monitoringConsentPolicyId: policy.id,
    },
  });

  return json({
    ok: true,
    acceptance,
    policyVersion: policy.version,
  });
});
