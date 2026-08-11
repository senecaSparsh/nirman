import { redirect } from "next/navigation";

export const metadata = { title: "Daily Progress Reports · Nirman" };

export default function DailyReportsPage() {
  redirect("/hr/dprs");
}
