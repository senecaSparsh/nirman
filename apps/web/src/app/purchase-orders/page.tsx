import { redirect } from "next/navigation";

export const metadata = { title: "Purchase Orders · Nirman" };

export default function PurchaseOrdersPage() {
  redirect("/procurement?tab=purchase-orders");
}
