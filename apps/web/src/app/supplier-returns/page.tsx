import { redirect } from "next/navigation";

export const metadata = { title: "Purchase Returns · Nirman" };

export default function SupplierReturnsPage() {
  redirect("/procurement?tab=returns");
}
