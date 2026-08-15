import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import MobileNewScrapGenerationClient from "./MobileNewScrapGenerationClient";

/**
 * /m/scrap-generations/new — mobile scrap generation form.
 * Server wrapper that gates on INVENTORY_MANAGE permission.
 */
export default async function MobileNewScrapGenerationPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.INVENTORY_MANAGE)) {
    return (
      <div className="p-4">
        <div className="mb-4">
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          New Scrap Generation
        </p>
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to generate scrap.
        </p>
      </div>
    );
  }

  return <MobileNewScrapGenerationClient />;
}
