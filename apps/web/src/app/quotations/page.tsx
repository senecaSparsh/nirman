import { redirect } from "next/navigation";

export const metadata = { title: "Quotations · Nirman" };

export default function QuotationsPage() {
  redirect("/procurement?tab=quotations");
}
