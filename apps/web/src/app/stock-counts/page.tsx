import { redirect } from "next/navigation";

export const metadata = { title: "Stock Inventory · Nirman" };

export default function StockCountsPage() {
  redirect("/stock?tab=counts");
}
