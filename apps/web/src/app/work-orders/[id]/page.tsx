import { redirect } from "next/navigation";

export const metadata = { title: "Work Order · Nirman" };

export default async function WorkOrderRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/work-orders?wo=${id}`);
}
