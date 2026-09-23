import { redirect } from "next/navigation";

export const metadata = { title: "Payroll · Nirman" };

export default function MobileHrPayrollPage() {
  // Payroll lives inside the Books hub as the Payroll Ledger.
  redirect("/m/books/payroll");
}
