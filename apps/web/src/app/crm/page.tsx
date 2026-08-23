import { redirect } from "next/navigation";

/**
 * /crm — alias for the CRM/leads pipeline, which lives under the Sales module.
 * Amoria Cafe.txt referred to "CRM" as a distinct module, but architecturally
 * the lead pipeline is embedded in Sales. This redirect keeps the /crm URL
 * working for users who expect it.
 */
export default function CrmRedirect() {
  redirect("/sales?tab=pipeline");
}
