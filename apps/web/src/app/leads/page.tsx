import { redirect } from "next/navigation";

export const metadata = { title: "Leads · Nirman" };

export default function LeadsPage() {
  redirect("/sales?tab=pipeline");
}
