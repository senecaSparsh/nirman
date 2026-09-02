import { getUserRole } from "@/lib/server";
import { hasPermission, type Permission } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";

/**
 * PERMISSION GATE — server-component wrapper that replaces the 3-line
 * boilerplate repeated in 500+ pages:
 *
 *   const role = await getUserRole();
 *   if (!hasPermission(role, PERM.X)) return <NoAccess />;
 *
 * Usage:
 *   <PermissionGate perm={PERM.SALES_VIEW} what="sales">
 *     <SalesContent />
 *   </PermissionGate>
 *
 * If the user lacks the permission, renders <NoAccess what={what} />.
 * Otherwise renders children as-is.
 *
 * This is a server component — it can be used directly in Server
 * Components and route handlers that render RSC. It cannot be used
 * inside client components.
 */
export async function PermissionGate({
  perm,
  what,
  children,
}: {
  perm: Permission;
  what?: string;
  children: React.ReactNode;
}) {
  const role = await getUserRole();
  if (!hasPermission(role, perm)) {
    return <NoAccess what={what} />;
  }
  return <>{children}</>;
}
