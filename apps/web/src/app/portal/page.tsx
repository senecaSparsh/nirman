import { redirect } from "next/navigation";
import { getPortalCustomer } from "@/lib/portal-auth";
import { PortalDashboard } from "./PortalDashboard";

export default async function PortalPage() {
  const customer = await getPortalCustomer();
  if (!customer) {
    redirect("/portal/login");
  }
  return <PortalDashboard customer={customer} />;
}
