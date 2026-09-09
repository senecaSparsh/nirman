"use client";

import { useRouter } from "next/navigation";
import { SaleDetailDialog } from "@/components/sales/sale-detail-dialog";
import type { AssetSaleRow } from "@/lib/types";

/**
 * Client wrapper that renders the shared `SaleDetailDialog` as an
 * always-open dialog on the desktop `/sales/[id]` detail page. When the
 * user closes the dialog (X button / overlay / Escape), navigate back to
 * the sales list — there's no local open-state to toggle on a deep link.
 */
export function SaleDetailPageClient({
  sale,
  permissions,
}: {
  sale: AssetSaleRow;
  permissions?: { canCreateSale?: boolean; canManage?: boolean };
}) {
  const router = useRouter();

  return (
    <SaleDetailDialog
      open
      onOpenChange={(o) => {
        if (!o) router.push("/sales");
      }}
      sale={sale}
      permissions={permissions}
    />
  );
}
