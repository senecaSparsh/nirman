import { redirect } from "next/navigation";

export const metadata = { title: "Petty Cash · Nirman" };

export default function PettyCashPage() {
  redirect("/finance?tab=petty-cash");
}
