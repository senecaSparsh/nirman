import { redirect } from "next/navigation";

export const metadata = { title: "Purchase Order · Nirman" };

export default async function PurchaseOrderRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/procurement/${id}`);
}
