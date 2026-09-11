import { redirect } from "next/navigation";

/**
 * /inventory — redirected to /build.
 *
 * This page was an earlier inventory hub draft that was never wired into the
 * desktop navigation. The Build world entry (`/build`) now serves as the
 * hub for the full inventory pipeline (acquire → procure → stock → construct
 * → sell), and `/stock` is the stock ledger. Keeping an orphaned page that
 * no nav item or link points to was confusing for users who hit it by
 * guessing the URL.
 */
export default function InventoryPage() {
  redirect("/build");
}
