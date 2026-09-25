import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

export const metadata = { title: "Transfers · Nirman" };

export default async function MobileTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ __surface?: string }>;
}) {
  const params = await searchParams;
  // Transfers live inside the Stock hub as a tab.
  redirect(withSurfaceParam("/m/stock?tab=transfers", params));
}
