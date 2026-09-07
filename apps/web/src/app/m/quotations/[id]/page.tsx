import { redirect } from "next/navigation";

/** Comparative analysis is a same-page overlay on /m/procurement. */
export default async function MobileQuotationDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/m/procurement?tab=quotations&open=${id}`);
}
