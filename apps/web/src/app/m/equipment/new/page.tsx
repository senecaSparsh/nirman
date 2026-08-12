import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import MobileNewEquipmentClient from "./MobileNewEquipmentClient";

/**
 * /m/equipment/new — mobile equipment registration.
 * Server wrapper that gates on ASSETS_MANAGE permission.
 */
export default async function MobileNewEquipmentPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.ASSETS_MANAGE)) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <MobileBackButton fallback="/m/equipment" />
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          New Equipment
        </p>
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to register equipment.
        </p>
      </div>
    );
  }

  return <MobileNewEquipmentClient />;
}
