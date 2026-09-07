import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import { MobileNewBrokerClient } from "./MobileNewBrokerClient";

/**
 * /m/brokers/new — mobile broker creation.
 * Server wrapper that gates on SALE_CREATE permission.
 */
export default function MobileNewBrokerPage() {
  return (
    <MobileNewEntityPage perm={PERM.SALE_CREATE} what="create brokers" permission="sale.create">
      {() => <MobileNewBrokerClient />}
    </MobileNewEntityPage>
  );
}
