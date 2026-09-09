import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { Page } from "@/components/page";
import { SupplierDetailContent } from "./content";

export const metadata = { title: "Supplier · Nirman" };

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Page>
      <Suspense fallback={<PageLoading label="Loading supplier…" />}>
        <SupplierDetailContent params={params} />
      </Suspense>
    </Page>
  );
}
