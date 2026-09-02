import { redirect } from "next/navigation";

/**
 * /m/requisitions — redirects to the unified procurement hub.
 * Indents are now a tab within /m/procurement.
 */
export default function MobileRequisitionsPage() {
  redirect("/m/procurement?tab=indents");
}
