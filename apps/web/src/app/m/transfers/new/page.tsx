import { getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import MobileNewTransferClient from "./MobileNewTransferClient";

/**
 * /m/transfers/new — create a stock transfer.
 * Gates on STOCK_TRANSFER permission.
 */
export default async function NewTransferPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.STOCK_TRANSFER)) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <MobileBackButton fallback="/m/transfers" />
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          New Stock Transfer
        </p>
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to transfer stock.
        </p>
      </div>
    );
  }

  return <MobileNewTransferClient />;
}
