import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

/**
 * /m/site/issue — redirects to the unified stock-out page in issue mode.
 * The old separate issue form has been merged into /m/stock-out.
 */
export default async function MobileIssuePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; from?: string ; __surface?: string }>;
}) {
  const params = await searchParams;
  redirect(
    withSurfaceParam(
      "/m/stock-out?mode=issue" +
        (params.project ? "&project=" + params.project : "") +
        (params.from ? "&from=" + params.from : ""),
      params,
    ),
  );
}
