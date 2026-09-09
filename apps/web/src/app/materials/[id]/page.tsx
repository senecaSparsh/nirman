import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { Page } from "@/components/page";
import { MaterialDetailContent } from "./content";

export const metadata = { title: "Material · Nirman" };

export default function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Page>
      <Suspense fallback={<PageLoading label="Loading material…" />}>
        <MaterialDetailContent params={params} />
      </Suspense>
    </Page>
  );
}
