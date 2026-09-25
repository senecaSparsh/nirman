import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

export const metadata = { title: "Scrap Generations · Nirman" };

export default async function MobileScrapGenerationsPage({
  searchParams,
}: {
  searchParams: Promise<{ __surface?: string }>;
}) {
  const params = await searchParams;
  // Scrap generations live inside the Stock hub as a tab.
  redirect(withSurfaceParam("/m/stock?tab=scrap", params));
}
