import { redirect } from "next/navigation";
import { connection } from "next/server";

/**
 * /m — mobile entry point.
 *
 * Redirects to the Home tab — the orbit navigation hub that shows the
 * user's companies and lets them drill down through the hierarchy.
 * This is a pure redirect: no UI. `connection()` opts the segment into
 * dynamic rendering (PPR-safe — no `force-dynamic` allowed on Next 16).
 */
export default async function MobileIndexPage() {
  await connection();
  redirect("/m/home");
}
