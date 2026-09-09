import { redirect } from "next/navigation";

export const metadata = { title: "Indents · Nirman" };

export default function RequisitionsPage() {
  redirect("/procurement?tab=indents");
}
