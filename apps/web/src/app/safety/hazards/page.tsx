import { redirect } from "next/navigation";

export const metadata = { title: "Hazards · Nirman" };

export default function HazardsPage() {
  redirect("/safety");
}
