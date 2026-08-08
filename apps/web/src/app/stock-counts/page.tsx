import { redirect } from "next/navigation";

export const metadata = { title: "Stock Taking · Nirman" };

export default function StockCountsPage() {
  redirect("/stock?tab=counts");
}
