import { redirect } from "next/navigation";

export const metadata = { title: "Transfers · Nirman" };

export default function MobileTransfersPage() {
  // Transfers live inside the Stock hub as a tab.
  redirect("/m/stock?tab=transfers");
}
