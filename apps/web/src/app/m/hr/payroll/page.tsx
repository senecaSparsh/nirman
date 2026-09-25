import { redirect } from "next/navigation";
import { withSurfaceParam } from "@/lib/surface-map";

export const metadata = { title: "Payroll · Nirman" };

export default async function MobileHrPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ __surface?: string }>;
}) {
  const params = await searchParams;
  // Payroll lives inside the Books hub as the Payroll Ledger.
  redirect(withSurfaceParam("/m/books/payroll", params));
}
