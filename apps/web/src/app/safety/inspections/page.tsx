import { redirect } from "next/navigation";

export const metadata = { title: "Inspections · Nirman" };

export default function InspectionsPage() {
  redirect("/safety");
}
