import { redirect } from "next/navigation";

/**
 * /m/site/issue — redirects to the unified stock-out page in issue mode.
 * The old separate issue form has been merged into /m/stock-out.
 */
export default function MobileIssuePage() {
  redirect("/m/stock-out?mode=issue");
}
