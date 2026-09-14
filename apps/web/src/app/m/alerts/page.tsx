import { redirect } from "next/navigation";

// /m/alerts has no index — redirect to the lease-expiry alert list, the only
// alert surface. Prevents a bare 404 if someone lands on /m/alerts directly.
export default function MobileAlertsPage() {
  redirect("/m/alerts/lease-expiry");
}
