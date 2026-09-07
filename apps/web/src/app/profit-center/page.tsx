import { redirect } from "next/navigation";

export const metadata = { title: "Profit Center · Nirman" };

export default function ProfitCenterPage() {
  redirect("/cost-control?tab=profit-center");
}
