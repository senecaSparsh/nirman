import { redirect } from "next/navigation";

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/m/quotations?open=${id}`);
}
