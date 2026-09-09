import { connection } from "next/server";
import { runBookReconciliation } from "@nirman/services";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";
import { BooksHealthView } from "@/components/finance/books-health-view";

export async function BooksHealthContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="the books health report" />;
  }

  const report = await runBookReconciliation(company.id);

  const checks = report.checks.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status,
    expected: toNum(c.expected),
    actual: toNum(c.actual),
    delta: toNum(c.delta),
    tolerance: toNum(c.tolerance),
    message: c.message,
    details: c.details.map((d) => ({
      id: d.id,
      label: d.label,
      expected: toNum(d.expected),
      actual: toNum(d.actual),
      delta: toNum(d.delta),
    })),
  }));

  return (
    <BooksHealthView
      timestamp={report.timestamp}
      allPass={report.allPass}
      summary={report.summary}
      checks={checks}
    />
  );
}
