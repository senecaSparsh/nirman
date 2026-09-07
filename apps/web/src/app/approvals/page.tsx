import { redirect } from "next/navigation";

export const metadata = { title: "Approvals · Nirman" };

export default function ApprovalsPage() {
  redirect("/hr/pending");
}
