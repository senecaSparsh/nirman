import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { CallsContent } from "./content";

export const metadata = { title: "Call Log · Nirman" };

export default function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <Suspense fallback={<PageLoading label="Loading calls…" variant="list" />}>
      <CallsContent searchParams={searchParams} />
    </Suspense>
  );
}
