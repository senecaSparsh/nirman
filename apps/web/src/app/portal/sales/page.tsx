import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { prisma } from "@nirman/db";
import { getPortalCustomer } from "@/lib/portal-auth";
import { toNum } from "@/lib/server";
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
    where: { customerId: customer.id, status: "ACTIVE" },
    include: {
      project: { select: { id: true, name: true } },
      landParcel: { select: { id: true, number: true, area: true, areaUnit: true } },
      builtUnit: {
        select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true, floor: true, wing: true },
      },
      payments: { orderBy: { paymentDate: "asc" } },
    },
    orderBy: { saleDate: "desc" },
  });

  const rows = sales.map((s) => {
    const totalPaid = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
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
    };
  });

  const totalBooked = rows.reduce((s, x) => s + x.totalAmount, 0);
  const totalPaid = rows.reduce((s, x) => s + x.totalPaid, 0);
  const totalDue = rows.reduce((s, x) => s + x.balanceDue, 0);

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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
