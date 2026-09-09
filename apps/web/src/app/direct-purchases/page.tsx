import { redirect } from "next/navigation";

export const metadata = { title: "Direct Purchases · Nirman" };

export default function DirectPurchasesPage() {
  redirect("/procurement?tab=direct-purchases");
}
