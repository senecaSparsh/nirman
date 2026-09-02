import { redirect } from "next/navigation";

export const metadata = { title: "Stock Counts · Nirman" };

export default function MobileStockCountsPage() {
  // Stock counts live inside the Stock hub as a tab.
  redirect("/m/stock?tab=counts");
}
