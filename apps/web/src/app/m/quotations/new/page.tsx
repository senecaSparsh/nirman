import { redirect } from "next/navigation";

/** New quotation is a same-page popup on /m/quotations. */
export default function MobileNewQuotationRedirect() {
  redirect("/m/quotations");
}
