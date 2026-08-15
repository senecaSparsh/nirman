import { connection } from "next/server";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileCompanyEditClient } from "./MobileCompanyEditClient";

/**
 * /m/settings/company — mobile page to edit company details.
 *
 * These details (name, GSTIN, PAN, address, phone, email) appear on every
 * printed bill, invoice, receipt, and purchase order. Only OWNER/ADMIN
 * can edit (COMPANY_MANAGE permission).
 */
export default async function MobileCompanyEditPage() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.COMPANY_MANAGE);

  return (
    <MobileCompanyEditClient
      company={{
        id: company.id,
        name: company.name,
        gstin: company.gstin,
        pan: company.pan,
        address: company.address,
        phone: company.phone,
        email: company.email,
        currency: company.currency,
        businessType: company.businessType,
      }}
      canManage={canManage}
    />
  );
}
