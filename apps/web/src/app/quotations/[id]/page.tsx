import { redirect } from "next/navigation";

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/procurement?tab=quotations&open=${id}`);
}
