import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

export const metadata = { title: "Stock Counts · Nirman" };

export default async function MobileStockCountsPage({
  searchParams,
}: {
  searchParams: Promise<{ __surface?: string }>;
}) {
  const params = await searchParams;
  // Stock counts live inside the Stock hub as a tab.
  redirect(withSurfaceParam("/m/stock?tab=counts", params));
}
