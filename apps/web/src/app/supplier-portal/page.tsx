import { redirect } from "next/navigation";
import { getPortalSupplier } from "@/lib/supplier-portal-auth";
import { SupplierPortalDashboard } from "./SupplierPortalDashboard";

export default async function SupplierPortalPage() {
  const supplier = await getPortalSupplier();
  if (!supplier) {
    redirect("/supplier-portal/login");
  }
  return <SupplierPortalDashboard supplier={supplier} />;
}
