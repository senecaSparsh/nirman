import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import MobileNewMaterialSaleClient from "./MobileNewMaterialSaleClient";

/**
 * /m/material-sales/new — mobile material sale creation.
 * Server wrapper that gates on SALE_CREATE permission.
 */
export default async function MobileNewMaterialSalePage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.SALE_CREATE)) {
    return (
      <div className="p-4">
        <div className="mb-4">
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          New Material Sale
        </p>
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to create sales.
        </p>
      </div>
    );
  }

  return <MobileNewMaterialSaleClient />;
}
