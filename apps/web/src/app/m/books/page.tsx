import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

/**
 * /m/books — redirect to /m/accounts.
 *
 * The old finance persona home ("Books") has been superseded by the
 * Accounts module tab (/m/accounts). All sub-routes (/m/books/finance,
 * /m/books/gl, /m/books/receipts, /m/books/payroll, /m/books/reports)
 * remain canonical and are linked from the Accounts nav group.
 */
export default async function BooksRedirect({
  searchParams,
}: {
  searchParams: Promise<{ __surface?: string }>;
}) {
  const params = await searchParams;
  redirect(withSurfaceParam("/m/accounts", params));
}
