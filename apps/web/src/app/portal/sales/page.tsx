import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Receipt } from "lucide-react";
import { prisma } from "@nirman/db";
import { getPortalCustomer } from "@/lib/portal-auth";
import { toNum } from "@/lib/server";
import { computeLateInterest } from "@nirman/services";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "My Sales" };

const STAGE_LABELS: Record<string, string> = {
  BOOKED: "Booked",
  BBA_SIGNED: "BBA Signed",
  PAYMENTS: "Payments In Progress",
  REGISTRY: "Registry Pending",
  COMPLETED: "Completed",
  PENDING: "Pending",
  DEPOSIT_RECEIVED: "Deposit Received",
  CANCELLED: "Cancelled",
};

const STAGE_COLORS: Record<string, string> = {
  BOOKED: "#3b82f6",
  BBA_SIGNED: "#8b5cf6",
  PAYMENTS: "#f59e0b",
  REGISTRY: "#06b6d4",
  COMPLETED: "#10b981",
  PENDING: "#64748b",
  DEPOSIT_RECEIVED: "#3b82f6",
  CANCELLED: "#ef4444",
};

function fmtCurrency(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export default async function PortalSalesPage() {
  const customer = await getPortalCustomer();
  if (!customer) {
    redirect("/portal/login");
  }

  const sales = await prisma.assetSale.findMany({
    // Portal customers are scoped by customerId alone — scopeWhere() routes
    // through the staff session layer (getCompany → sign-in redirect for
    // users with no staff context), which would strip every row here.
    where: { customerId: customer.id, status: "ACTIVE" },
    include: {
      project: { select: { id: true, name: true } },
      landParcel: { select: { id: true, number: true, area: true, areaUnit: true } },
      builtUnit: {
        select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true, floor: true, wing: true },
      },
      payments: { orderBy: { paymentDate: "asc" } },
      paymentSchedule: { include: { items: { orderBy: { installmentNo: "asc" } } } },
    },
    orderBy: { saleDate: "desc" },
  });

  // Company UPI VPA → per-installment tap-to-pay links on the statement.
  const companyRow = await prisma.company.findUnique({
    where: { id: customer.companyId },
    select: { upiId: true, name: true },
  });
  const upiId = companyRow?.upiId ?? null;
  const companyName = companyRow?.name ?? "";

  const rows = sales.map((s) => {
    const totalPaid = s.payments.reduce((sum, p) => sum + (p.status === "VOID" ? 0 : toNum(p.amount) - toNum(p.interestAmount)), 0);
    const totalAmount = toNum(s.salePrice) + toNum(s.gstAmount);
    return {
      id: s.id,
      saleNumber: s.saleNumber,
      saleDate: s.saleDate.toISOString(),
      saleStage: s.saleStage,
      assetType: s.assetType,
      projectName: s.project?.name ?? "—",
      unitLabel:
        s.assetType === "LAND"
          ? `Plot ${s.landParcel?.number ?? "—"}`
          : `Unit ${s.builtUnit?.unitNumber ?? "—"}`,
      salePrice: toNum(s.salePrice),
      totalAmount,
      totalPaid,
      balanceDue: totalAmount - totalPaid,
      paymentProgress: totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0,
      payments: s.payments
        .filter((p) => p.status !== "VOID")
        .map((p) => ({
          id: p.id,
          amount: toNum(p.amount),
          date: p.paymentDate.toISOString(),
          mode: p.mode,
        })),
      scheduleItems:
        s.paymentSchedule?.items.map((i) => ({
          id: i.id,
          no: i.installmentNo,
          description: i.description,
          dueDate: i.dueDate ? i.dueDate.toISOString() : null,
          totalAmount: toNum(i.totalAmount),
          paidAmount: toNum(i.paidAmount),
          status: i.status,
        })) ?? [],
    };
  });

  const totalBooked = rows.reduce((s, x) => s + toNum(x.totalAmount), 0);
  const totalPaid = rows.reduce((s, x) => s + toNum(x.totalPaid), 0);
  const totalDue = rows.reduce((s, x) => s + toNum(x.balanceDue), 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Back link */}
      <Link
        href="/portal"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">My Bookings</h1>
          <p className="text-xs text-slate-500">{customer.companyName} · Customer Portal</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-700">{customer.name}</p>
          <p className="text-xs text-slate-400">{customer.phone}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="portal-card text-center">
          <p className="text-xs text-slate-500">Total Booked</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{fmtCurrency(totalBooked)}</p>
        </div>
        <div className="portal-card text-center">
          <p className="text-xs text-slate-500">Total Paid</p>
          <p className="mt-1 text-lg font-bold text-emerald-600">{fmtCurrency(totalPaid)}</p>
        </div>
        <div className="portal-card text-center">
          <p className="text-xs text-slate-500">Balance Due</p>
          <p className="mt-1 text-lg font-bold text-amber-600">{fmtCurrency(totalDue)}</p>
        </div>
      </div>

      {/* Sales list */}
      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No active bookings found"
          description="Contact your sales representative if this seems incorrect."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((sale) => (
            <div
              key={sale.id}
              className="portal-card transition-colors hover:border-slate-300"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{sale.unitLabel}</span>
                    <span
                      className="portal-badge"
                      style={{
                        background: `${STAGE_COLORS[sale.saleStage] ?? "#64748b"}15`,
                        color: STAGE_COLORS[sale.saleStage] ?? "#64748b",
                      }}
                    >
                      {STAGE_LABELS[sale.saleStage] ?? sale.saleStage}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {sale.projectName} · {sale.saleNumber} · Booked {fmtDate(sale.saleDate)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{fmtCurrency(sale.totalAmount)}</p>
                  <p className="text-xs text-slate-500">{sale.paymentProgress}% paid</p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${sale.paymentProgress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="font-medium text-emerald-600">{fmtCurrency(sale.totalPaid)} paid</span>
                <span className="font-medium text-amber-600">{fmtCurrency(sale.balanceDue)} due</span>
              </div>
              <div className="mt-1.5 text-right">
                <a
                  href={`/print/sale-statement/${sale.id}`}
                  target="_blank"
                  className="text-[11px] font-medium text-brand hover:underline"
                >
                  Download statement ↓
                </a>
              </div>

              {/* Allottee statement — the installment plan + payment ledger the
                  buyer otherwise has to call the office for. Next-due
                  installment is highlighted; each payment links to its
                  printable receipt. */}
              {sale.scheduleItems.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">Payment Schedule</p>
                  <div className="space-y-1">
                    {sale.scheduleItems.map((i) => {
                      const overdue = i.dueDate && i.status !== "PAID" && new Date(i.dueDate) < new Date();
                      const balance = i.totalAmount - i.paidAmount;
                      const late = overdue ? computeLateInterest({ totalAmount: i.totalAmount, paidAmount: i.paidAmount, dueDate: i.dueDate }) : null;
                      const payAmount = late ? Number(late.totalPayable) : balance;
                      const upiHref = upiId && i.status !== "PAID" && i.status !== "WAIVED" && balance > 0.01
                        ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(companyName).slice(0, 100)}&am=${payAmount}&cu=INR&tn=${encodeURIComponent(`${sale.saleNumber} inst ${i.no}`)}`
                        : null;
                      return (
                        <div key={i.id} className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-xs ${i.status === "PAID" ? "bg-emerald-50" : overdue ? "bg-red-50" : "bg-slate-50"}`}>
                          <span className="text-slate-700">
                            <span className="font-medium">#{i.no}</span> {i.description}
                          </span>
                          <span className={`tnum font-medium ${i.status === "PAID" ? "text-emerald-700" : overdue ? "text-red-700" : "text-slate-600"}`}>
                            {fmtCurrency(i.totalAmount)}
                            {i.dueDate && <span className="ml-1.5 font-normal text-slate-400">· {fmtDate(i.dueDate)}</span>}
                            {late && <span className="ml-1.5 text-red-500" title="Late interest accrued">+{fmtCurrency(Number(late.interest))} int</span>}
                            <span className={`ml-1.5 ${i.status === "PAID" ? "text-emerald-600" : overdue ? "text-red-500" : "text-slate-400"}`}>
                              {i.status === "PAID" ? "✓" : overdue ? "Overdue" : i.status === "PARTIAL" ? `${fmtCurrency(balance)} left` : i.status.toLowerCase()}
                            </span>
                            {upiHref && (
                              <a href={upiHref} className="ml-1.5 inline-block rounded bg-brand px-1.5 py-0.5 font-medium text-white">Pay</a>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {sale.payments.length > 0 && (
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">Payments</p>
                  <div className="space-y-1">
                    {sale.payments.map((p) => (
                      <a
                        key={p.id}
                        href={`/print/payment-receipt/${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <span className="flex items-center gap-1.5">
                          <Receipt className="h-3 w-3 text-slate-400" />
                          {fmtDate(p.date)} · {p.mode.replace(/_/g, " ").toLowerCase()}
                        </span>
                        <span className="tnum font-medium text-emerald-700">{fmtCurrency(p.amount)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
