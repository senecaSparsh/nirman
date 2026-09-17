import { redirect } from "next/navigation";

/**
 * /m/site/issue — redirects to the unified stock-out page in issue mode.
 * The old separate issue form has been merged into /m/stock-out.
 */
export default async function MobileIssuePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; from?: string }>;
}) {
  const params = await searchParams;
  redirect(
    "/m/stock-out?mode=issue" +
      (params.project ? "&project=" + params.project : "") +
      (params.from ? "&from=" + params.from : ""),
  );
}
