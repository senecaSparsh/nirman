import { redirect } from "next/navigation";

export const metadata = { title: "Supplier Payments · Nirman" };

export default function SupplierPaymentsPage() {
  redirect("/finance?tab=supplier-payments");
}
