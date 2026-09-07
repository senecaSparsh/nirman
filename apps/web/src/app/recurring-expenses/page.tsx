import { redirect } from "next/navigation";

export const metadata = { title: "Recurring Expenses · Nirman" };

export default function RecurringExpensesPage() {
  redirect("/finance?tab=recurring");
}
