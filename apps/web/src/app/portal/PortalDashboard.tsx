"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Building2, FileText } from "lucide-react";
import type { PortalCustomer } from "@/lib/portal-auth";
import { EmptyState } from "@/components/empty-state";

interface PortalSale {
  id: string;
  saleNumber: string;
  saleDate: string;
  saleStage: string;
  assetType: string;
  projectName: string;
  unitLabel: string;
  unitArea: number | null;
  unitAreaUnit: string;
  salePrice: number;
  gstAmount: number;
  totalAmount: number;
  totalPaid: number;
  balanceDue: number;
  paymentProgress: number;
  atsDocumentUrl: string | null;
  bbaDocumentUrl: string | null;
  registryDocumentUrl: string | null;
  allotmentDocumentUrl: string | null;
  draftDocumentUrl: string | null;
  allotmentLetterNo: string | null;
  bbaNo: string | null;
  saleDeedNo: string | null;
  atsNo: string | null;
  payments: { id: string; amount: number; paymentDate: string; mode: string; reference: string | null; status: string }[];
  paymentSchedule: {
    type: string;
    items: { id: string; installmentNo: number; description: string; percentage: number; amount: number; dueDate: string | null; status: string; paidAmount: number }[];
  } | null;
}

function fmtCurrency(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STAGE_LABELS: Record<string, string> = {
  BOOKED: "Booked",
  BBA_SIGNED: "BBA Signed",
  PAYMENTS: "Payments In Progress",
  REGISTRY: "Registry Pending",
  COMPLETED: "Completed",
};

const STAGE_COLORS: Record<string, string> = {
  BOOKED: "#3b82f6",
  BBA_SIGNED: "#8b5cf6",
  PAYMENTS: "#f59e0b",
  REGISTRY: "#06b6d4",
  COMPLETED: "#10b981",
};

interface PortalProject {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  address: string | null;
  totalUnits: number;
  progressPct: number;
  latestUpdates: { id: string; date: string; summary: string; photos: string[] }[];
}

export function PortalDashboard({ customer }: { customer: PortalCustomer }) {
  const router = useRouter();
  const [sales, setSales] = useState<PortalSale[]>([]);
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<PortalSale | null>(null);
  const [tab, setTab] = useState<"bookings" | "construction">("bookings");

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/sales").then((r) => r.json()),
      fetch("/api/portal/projects").then((r) => r.json()),
    ])
      .then(([salesData, projectsData]) => {
        setSales(salesData.sales ?? []);
        setProjects(projectsData.projects ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function logout() {
    await fetch("/api/portal/auth/logout", { method: "POST" });
    router.push("/portal/login");
    router.refresh();
  }

  const totalBooked = sales.reduce((s, x) => s + x.totalAmount, 0);
  const totalPaid = sales.reduce((s, x) => s + x.totalPaid, 0);
  const totalDue = sales.reduce((s, x) => s + x.balanceDue, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white font-bold">
            N
          </div>
          <div>
            <h1 className="text-title text-slate-900">{customer.companyName}</h1>
            <p className="text-xs text-slate-500">Customer Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-slate-700">{customer.name}</p>
            <p className="text-xs text-slate-400">{customer.phone}</p>
          </div>
          <button
            className="portal-btn portal-btn-secondary text-xs"
            onClick={logout}
          >
            Logout
          </button>
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

      {/* Tab switcher */}
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "bookings" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          onClick={() => setTab("bookings")}
        >
          My Bookings
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "construction" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          onClick={() => setTab("construction")}
        >
          Construction Progress
        </button>
      </div>

      {/* Bookings tab */}
      {tab === "bookings" && (loading ? (
        <div className="portal-card text-center text-sm text-slate-400">Loading your bookings…</div>
      ) : sales.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No active bookings found"
          description="Contact your sales representative if this seems incorrect."
        />
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => (
            <div
              key={sale.id}
              className="portal-card cursor-pointer hover:border-slate-300 transition-colors"
              onClick={() => setSelectedSale(sale)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{sale.unitLabel}</span>
                    <span
                      className="portal-badge"
                      style={{ background: `${STAGE_COLORS[sale.saleStage] ?? "#64748b"}15`, color: STAGE_COLORS[sale.saleStage] ?? "#64748b" }}
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
                <span className="text-emerald-600 font-medium">{fmtCurrency(sale.totalPaid)} paid</span>
                <span className="text-amber-600 font-medium">{fmtCurrency(sale.balanceDue)} due</span>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Construction tab */}
      {tab === "construction" && (loading ? (
        <div className="portal-card text-center text-sm text-slate-400">Loading construction updates…</div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="No construction updates available yet"
        />
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <div key={project.id} className="portal-card">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{project.name}</h3>
                  {project.address && <p className="text-xs text-slate-500">{project.address}</p>}
                </div>
                <span className="portal-badge" style={{ background: "#0f172a15", color: "#0f172a" }}>
                  {project.status}
                </span>
              </div>
              {project.endDate && (
                <p className="mb-3 text-xs text-slate-500">
                  Expected completion: {fmtDate(project.endDate)}
                </p>
              )}
              {project.progressPct > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600">Overall Progress</span>
                    <span className="font-medium text-slate-900">{project.progressPct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${project.progressPct}%` }} />
                  </div>
                </div>
              )}
              {project.latestUpdates.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600">Latest Updates</p>
                  {project.latestUpdates.map((update) => (
                    <div key={update.id} className="rounded-lg bg-slate-50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-700">{fmtDate(update.date)}</span>
                        <span className="portal-badge" style={{ background: "#10b98115", color: "#10b981" }}>
                          Verified
                        </span>
                      </div>
                      {update.summary && <p className="mt-1 text-sm text-slate-600">{update.summary}</p>}
                      {update.photos.length > 0 && (
                        <div className="mt-2 flex gap-2">
                          {update.photos.map((photo, i) => (
                            <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg">
                              <Image src={photo} alt={`Update ${i + 1}`} fill className="object-cover" sizes="64px" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No updates published yet.</p>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Sale detail modal */}
      {selectedSale && (
        <SaleDetailModal sale={selectedSale} onClose={() => setSelectedSale(null)} />
      )}
    </div>
  );
}

function SaleDetailModal({ sale, onClose }: { sale: PortalSale; onClose: () => void }) {
  const documents = [
    { label: "Agreement to Sell (ATS)", url: sale.atsDocumentUrl, no: sale.atsNo },
    { label: "Allotment Letter", url: sale.allotmentDocumentUrl, no: sale.allotmentLetterNo },
    { label: "BBA", url: sale.bbaDocumentUrl, no: sale.bbaNo },
    { label: "Sale Deed / Registry", url: sale.registryDocumentUrl, no: sale.saleDeedNo },
    { label: "Draft / LOI", url: sale.draftDocumentUrl, no: null },
  ].filter((d) => d.url || d.no);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{sale.unitLabel}</h2>
            <p className="text-xs text-slate-500">{sale.projectName} · {sale.saleNumber}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Summary */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Total Amount</p>
            <p className="font-bold text-slate-900">{fmtCurrency(sale.totalAmount)}</p>
            <p className="text-xs text-slate-400">incl. GST {fmtCurrency(sale.gstAmount)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Balance Due</p>
            <p className="font-bold text-amber-600">{fmtCurrency(sale.balanceDue)}</p>
            <p className="text-xs text-slate-400">{fmtCurrency(sale.totalPaid)} paid ({sale.paymentProgress}%)</p>
          </div>
        </div>

        {/* Documents */}
        {documents.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Documents</h3>
            <div className="space-y-2">
              {documents.map((doc, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{doc.label}</p>
                    {doc.no && <p className="text-xs text-slate-400">No: {doc.no}</p>}
                  </div>
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="portal-btn portal-btn-secondary text-xs"
                    >
                      Download
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment schedule */}
        {sale.paymentSchedule && (
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              Payment Schedule ({sale.paymentSchedule.type})
            </h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Due</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.paymentSchedule.items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-500">{item.installmentNo}</td>
                      <td className="px-3 py-2 text-slate-700">{item.description}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">{fmtCurrency(item.amount)}</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-500">
                        {item.dueDate ? fmtDate(item.dueDate) : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className="portal-badge"
                          style={{
                            background: item.status === "PAID" ? "#10b98115" : item.status === "OVERDUE" ? "#ef444415" : "#f59e0b15",
                            color: item.status === "PAID" ? "#10b981" : item.status === "OVERDUE" ? "#ef4444" : "#f59e0b",
                          }}
                        >
                          {item.status === "PAID" ? "Paid" : item.status === "OVERDUE" ? "Overdue" : "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payment history */}
        {sale.payments.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Payment History</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Mode</th>
                    <th className="px-3 py-2 text-left">Reference</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.payments.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{fmtDate(p.paymentDate)}</td>
                      <td className="px-3 py-2 text-slate-500">{p.mode}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{p.reference ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-medium text-emerald-600">{fmtCurrency(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Print buttons */}
        <div className="flex gap-2 pt-2">
          <a
            href={`/print/allotment-letter/${sale.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="portal-btn portal-btn-secondary flex-1 text-xs"
          >
            Print Allotment Letter
          </a>
          <a
            href={`/print/demand-notice/${sale.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="portal-btn portal-btn-secondary flex-1 text-xs"
          >
            Print Demand Notice
          </a>
        </div>
      </div>
    </div>
  );
}
