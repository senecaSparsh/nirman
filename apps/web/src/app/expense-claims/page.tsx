import { redirect } from "next/navigation";

export const metadata = { title: "Expense Claims · Nirman" };

export default function ExpenseClaimsPage() {
  redirect("/finance?tab=claims");
}
