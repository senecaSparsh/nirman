import { prisma } from "@nirman/db";
import { apiHandler, json, requireUser, getCompany } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";

/**
 * GET /api/me/auth-info — returns auth-related info for the current session.
 *
 * Used by the client to determine:
 *   - Whether the user must change their password (mustChangePassword)
 *   - Whether the user has accepted the call-monitoring consent policy
 *   - Whether the user has any call-related permissions
 *   - Last login info
 */
export const GET = apiHandler(async () => {
  const currentUser = await requireUser();
  const company = await getCompany();

  // Fetch the full user record (CurrentUser type doesn't have all fields)
  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: {
      mustChangePassword: true,
      passwordChangedAt: true,
      monitoringConsentAcceptedAt: true,
      monitoringConsentPolicyId: true,
      lastLoginAt: true,
    },
  });

  // Check if there's an active consent policy and whether the user accepted it
  const activePolicy = await prisma.consentPolicy.findFirst({
    where: { companyId: company.id, retiredAt: null },
    orderBy: { effectiveAt: "desc" },
    select: { id: true, version: true, policyText: true, effectiveAt: true },
  });

  const consentAccepted = activePolicy
    ? (user?.monitoringConsentAcceptedAt !== null && user?.monitoringConsentPolicyId === activePolicy.id)
    : true; // no policy = no consent needed

  return json({
    mustChangePassword: user?.mustChangePassword ?? false,
    passwordChangedAt: user?.passwordChangedAt ?? null,
    consentAccepted,
    consentPolicy: activePolicy ? {
      id: activePolicy.id,
      version: activePolicy.version,
      policyText: activePolicy.policyText,
    } : null,
    hasCallPermissions: hasPermission(currentUser.role, PERM.CALL_VIEW),
    lastLoginAt: user?.lastLoginAt ?? null,
  });
});
