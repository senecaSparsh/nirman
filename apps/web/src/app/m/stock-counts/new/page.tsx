import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import MobileNewStockCountClient from "./MobileNewStockCountClient";

/**
 * /m/stock-counts/new — mobile stock count creation.
 * Server wrapper that gates on INVENTORY_MANAGE permission.
 */
export default async function MobileNewStockCountPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.INVENTORY_MANAGE)) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <MobileBackButton fallback="/m/stock-counts" />
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          New Stock Count
        </p>
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to create stock counts.
        </p>
      </div>
    );
  }

  return <MobileNewStockCountClient />;
}
