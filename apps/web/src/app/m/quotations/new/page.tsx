import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

/** New quotation is a same-page popup on the procurement hub quotations tab. */
export default async function MobileNewQuotationRedirect({
  searchParams,
}: {
  searchParams: Promise<{ __surface?: string }>;
}) {
  const params = await searchParams;
  redirect(withSurfaceParam("/m/procurement?tab=quotations&new=1", params));
}
