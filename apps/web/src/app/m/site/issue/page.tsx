import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import MobileIssueForm from "./MobileIssueForm";

/**
 * /m/site/issue — mobile material issue form (site challan).
 * Server wrapper that gates on STOCK_ISSUE permission.
 */
export default async function MobileIssuePage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.STOCK_ISSUE)) {
    return (
      <div className="p-4">
        <div className="mb-4">
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          Issue Materials
        </p>
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to issue materials.
        </p>
      </div>
    );
  }

  return <MobileIssueForm />;
}
