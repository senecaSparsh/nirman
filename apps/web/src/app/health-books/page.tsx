import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { BooksHealthContent } from "./content";

export const metadata = { title: "Books Health · Nirman" };
export const dynamic = "force-dynamic";

export default function BooksHealthPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Books Health"
        description="Five independent tie-outs that prove the operational ledgers (stock, land, units) agree with the general ledger — before the owner notices they don't."
      />
      <Suspense fallback={<PageLoading label="Running reconciliation checks…" />}>
        <BooksHealthContent />
      </Suspense>
    </div>
  );
}
