import { redirect } from "next/navigation";

// Desktop has no per-count route — count detail lives in a dialog on the
// counts tab. A deep link (shared mobile URL, notification, typed path)
// should land on the list, not a 404.
export default function StockCountDetailRedirect() {
  redirect("/stock?tab=counts");
}
