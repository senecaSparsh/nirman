import { redirect } from "next/navigation";

/**
 * /m/quotations — redirects to the unified procurement hub.
 * Quotation Requests are now a tab within /m/procurement.
 */
export default function MobileQuotationsPage() {
  redirect("/m/procurement?tab=quotations");
}
