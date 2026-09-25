import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

/** Comparative analysis is a same-page overlay on /m/procurement. */
export default async function MobileQuotationDetailRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ __surface?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  redirect(withSurfaceParam(`/m/procurement?tab=quotations&open=${id}`, sp));
}
