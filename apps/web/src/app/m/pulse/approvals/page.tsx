import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

export default async function PulseApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ __surface?: string }>;
}) {
  const params = await searchParams;
  redirect(withSurfaceParam("/m/approvals", params));
}
