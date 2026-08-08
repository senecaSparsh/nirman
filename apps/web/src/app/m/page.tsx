import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getUserRole } from "@/lib/server";
import { personaForRole } from "@/lib/mobile-nav";

/**
 * /m — mobile entry point.
 *
 * Resolves the current user's role server-side and redirects to their
 * persona home (Pulse / Command / Site / Book / Books). This is a pure
 * redirect: no UI. `connection()` opts the segment into dynamic rendering
 * (PPR-safe — no `force-dynamic` allowed on Next 16).
 */
export default async function MobileIndexPage() {
  await connection();
  const role = await getUserRole();
  const persona = personaForRole(role);
  redirect(persona.home);
}
