import { redirect } from "next/navigation";

export default function CrewsPage() {
  redirect("/hr/employees?tab=crews");
}
