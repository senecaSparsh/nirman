import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

export default async function ExpensesHubPage({
  searchParams,
}: {
  searchParams: Promise<{ __surface?: string }>;
}) {
  const params = await searchParams;
  redirect(withSurfaceParam("/m/accounts?tab=expenses", params));
}
