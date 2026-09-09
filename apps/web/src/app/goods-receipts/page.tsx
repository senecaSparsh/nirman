import { redirect } from "next/navigation";

export const metadata = { title: "Goods Receipts · Nirman" };

export default function GoodsReceiptsPage() {
  redirect("/procurement?tab=purchase-orders");
}
