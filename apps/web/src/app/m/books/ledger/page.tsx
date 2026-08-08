import { connection } from "next/server";
import { BookOpen, TrendingUp, Wallet } from "lucide-react";
import { MobilePageHeader, MobileSectionTitle, MobileRow, MobileRefreshButton } from "@/components/mobile/mobile-primitives";

/** Finance → Ledger tab: GL + reports shortcuts. */
export default async function BooksLedgerPage() {
  await connection();
  return (
    <div>
      <MobilePageHeader title="Ledger" subtitle="General ledger & analytics" right={<MobileRefreshButton />} />

      <MobileSectionTitle>GL</MobileSectionTitle>
      <div>
        <MobileRow href="/m/books/gl" icon={BookOpen} title="Trial Balance" subtitle="All accounts" />
        <MobileRow href="/m/books/finance" icon={Wallet} title="Finance" subtitle="Expenses & project costs" />
      </div>

      <MobileSectionTitle>Reports</MobileSectionTitle>
      <div>
        <MobileRow href="/m/books/reports" icon={TrendingUp} title="Analytics Overview" subtitle="Key metrics at a glance" />
      </div>
    </div>
  );
}
