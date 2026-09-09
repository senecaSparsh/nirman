import { redirect } from "next/navigation";

export const metadata = { title: "NCRs · Nirman" };

export default function NcrIndexPage() {
  redirect("/quality-control");
}
