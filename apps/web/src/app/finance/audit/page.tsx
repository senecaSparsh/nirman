import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { hasPermission } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { AuditTrailView } from "./audit-view";

/**
 * /finance/audit — system-wide audit trail.
 * Server-side RBAC: only OWNER/ADMIN can access.
 * Fetches the user list for the filter dropdown and passes it to the client view.
 */
export default function AuditTrailPage() {
  return <AuditTrailContent />;
}

async function AuditTrailContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  const isSuperuser = role === "OWNER" || role === "ADMIN";
  if (!isSuperuser) {
    return <NoAccess what="the audit trail" />;
  }

  // Fetch users for the filter dropdown
  const users = await prisma.user.findMany({
    where: { memberships: { some: { companyId: company.id } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Audit Trail"
        description="System-wide activity log — every create, update, approve, and delete action across all modules, with user and timestamp."
      />
      <AuditTrailView users={users.map((u) => ({ id: u.id, name: u.name }))} />
    </>
  );
}
