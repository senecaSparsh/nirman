import { redirect } from "next/navigation";

export const metadata = { title: "Budget Variance · Nirman" };

export default function BudgetVariancePage() {
  redirect("/cost-control?tab=budget-variance");
}
