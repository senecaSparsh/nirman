import { redirect } from "next/navigation";

export const metadata = { title: "Expense Budgets · Nirman" };

export default function ExpenseBudgetsPage() {
  redirect("/finance?tab=budgets");
}
