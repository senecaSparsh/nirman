import { redirect } from "next/navigation";

export const metadata = { title: "Transfers · Nirman" };

export default function TransfersPage() {
  // Stock transfers live inside the Stock hub as a tab.
  redirect("/stock?tab=transfers");
}
