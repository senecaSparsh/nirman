import { redirect } from "next/navigation";

export const metadata = { title: "Quotes · Nirman" };

export default function QuotesPage() {
  redirect("/procurement?tab=quotations");
}
