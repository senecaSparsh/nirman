import { redirect } from "next/navigation";

/**
 * /m/books — redirect to /m/accounts.
 *
 * The old finance persona home ("Books") has been superseded by the
 * Accounts module tab (/m/accounts). All sub-routes (/m/books/finance,
 * /m/books/gl, /m/books/receipts, /m/books/payroll, /m/books/reports)
 * remain canonical and are linked from the Accounts nav group.
 */
export default function BooksRedirect() {
  redirect("/m/accounts");
}
