import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { CallDetailContent } from "./content";

export const metadata = { title: "Call Detail · Nirman" };

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageLoading label="Loading call…" variant="default" />}>
      <CallDetailContent id={id} />
    </Suspense>
  );
}
