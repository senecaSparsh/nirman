import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

// /m/dev has no index — only the error-tester child. Same convention as
// /m/alerts: land the bare path on its one surface instead of a 404.
export default async function MobileDevPage({
  searchParams,
}: {
  searchParams: Promise<{ __surface?: string }>;
}) {
  const params = await searchParams;
  redirect(withSurfaceParam("/m/dev/errors", params));
}
