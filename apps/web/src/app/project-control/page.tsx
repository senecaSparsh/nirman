import { redirect } from "next/navigation";

export const metadata = { title: "Project Control · Nirman" };

export default function ProjectControlPage() {
  redirect("/cost-control?tab=project-control");
}
