import { redirect } from "next/navigation";

/** New quotation is a same-page popup on the procurement hub quotations tab. */
export default function MobileNewQuotationRedirect() {
  redirect("/m/procurement?tab=quotations&new=1");
}
