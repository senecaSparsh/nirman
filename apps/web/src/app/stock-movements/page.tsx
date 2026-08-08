import { redirect } from "next/navigation";

export const metadata = { title: "Stock Movements · Nirman" };

export default function StockMovementsPage() {
  redirect("/stock?tab=movements");
}
