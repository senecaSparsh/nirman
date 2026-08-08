import { redirect } from "next/navigation";

export const metadata = { title: "Task Management · Nirman" };

export default function TasksPage() {
  redirect("/my-tasks");
}
