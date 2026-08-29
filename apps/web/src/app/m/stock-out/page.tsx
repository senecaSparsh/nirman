import { Suspense } from "react";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { MobileStockOutClient } from "./MobileStockOutClient";

/**
 * /m/stock-out — unified stock-out form (Transfer | Issue in one page).
 *
 * Replaces the separate /m/transfers/new and /m/site/issue pages with a
 * single seamless form. A segmented control at the top switches between
 * "Transfer to Location" and "Issue to Project" — shared fields (source
 * location, material lines, notes) stay put, only the destination section
 * swaps. The right API + offline queue type is used at submit time.
 *
 * Permission gating: the user needs STOCK_TRANSFER for transfer mode,
 * STOCK_ISSUE for issue mode. If they have neither, show no-access.
 * If they have only one, the form defaults to that mode and the toggle
 * for the other is hidden.
 *
 * Query params:
 *   ?mode=transfer|issue  — pre-select mode
 *   ?project=<id>         — pre-select project (issue mode, deep-linked from project detail)
 */
export default function StockOutPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; project?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={4} />}>
      <StockOutContent searchParams={searchParams} />
    </Suspense>
  );
}

async function StockOutContent({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; project?: string }>;
}) {
  const role = await getUserRole();
  const canTransfer = hasPermission(role, PERM.STOCK_TRANSFER);
  const canIssue = hasPermission(role, PERM.STOCK_ISSUE);

  if (!canTransfer && !canIssue) {
    return (
      <MobileNoAccess what="move stock out" permission="stock.transfer or stock.issue" />
    );
  }

  const params = await searchParams;
  const initialMode: "transfer" | "issue" =
    params.mode === "issue" && canIssue
      ? "issue"
      : params.mode === "transfer" && canTransfer
        ? "transfer"
        : canTransfer
          ? "transfer"
          : "issue";

  return (
    <MobileStockOutClient
      canTransfer={canTransfer}
      canIssue={canIssue}
      initialMode={initialMode}
      initialProjectId={params.project ?? ""}
    />
  );
}
