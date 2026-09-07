import { redirect } from "next/navigation";

export const metadata = { title: "Material Indents · Nirman" };

export default function RequisitionsPage() {
  redirect("/procurement?tab=indents");
}
