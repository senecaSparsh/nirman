import { redirect } from "next/navigation";

export const metadata = { title: "Expenses · Nirman" };

export default function ExpensesPage() {
  redirect("/finance?tab=expenses");
}
