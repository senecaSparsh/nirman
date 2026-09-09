import { redirect } from "next/navigation";

export const metadata = { title: "Incidents · Nirman" };

export default function IncidentsPage() {
  redirect("/safety");
}
