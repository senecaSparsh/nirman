import { redirect } from "next/navigation";

/**
 * /m/transfers/new — redirects to the unified stock-out page in transfer mode.
 * The old separate transfer form has been merged into /m/stock-out.
 */
export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  redirect("/m/stock-out?mode=transfer" + (params.from ? "&from=" + params.from : ""));
}
