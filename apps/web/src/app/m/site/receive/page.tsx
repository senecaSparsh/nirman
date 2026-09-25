import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

export default async function SiteReceivePage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string ; __surface?: string }>;
}) {
  const params = await searchParams;
  redirect(withSurfaceParam("/m/site/field" + (params.po ? "?po=" + params.po : ""), params));
}
