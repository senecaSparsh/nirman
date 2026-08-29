import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { MobileNewBrokerClient } from "./MobileNewBrokerClient";

/**
 * /m/brokers/new — mobile broker creation.
 * Server wrapper that gates on SALE_CREATE permission.
 */
export default async function MobileNewBrokerPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.SALE_CREATE)) {
    return <MobileNoAccess what="create brokers" permission="sale.create" />;
  }

  return <MobileNewBrokerClient />;
}
