import * as React from "react";
import { ShiftRail, type ShiftData } from "@/components/mobile/v2/persona-signature/shift-rail";
import { ProjectPulse, type PulseData } from "@/components/mobile/v2/persona-signature/project-pulse";
import { PipelineFlow, type PipelineData } from "@/components/mobile/v2/persona-signature/pipeline-flow";
import { DealFunnel, type FunnelData } from "@/components/mobile/v2/persona-signature/deal-funnel";
import { CashPosition, type CashData } from "@/components/mobile/v2/persona-signature/cash-position";
import { MusterRing, type MusterData } from "@/components/mobile/v2/persona-signature/muster-ring";

const now = new Date();
const at = (h: number, m = 0) => {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const shift: ShiftData = {
  employee: { id: "e1", name: "Rakesh Yadav" },
  site: { id: "s1", name: "Skyline Tower · Sector 62" },
  attendance: {
    checkIn: at(8, 12),
    checkOut: null,
    status: "PRESENT",
    hoursWorked: null,
    location: "Gate B",
  },
  dpr: { submitted: false, status: null, id: null },
  tasks: [
    { id: "t1", title: "Pour slab — Block C, level 4", dueDate: at(11), priority: "HIGH", overdue: false },
    { id: "t2", title: "Rebar inspection sign-off", dueDate: at(14), priority: "MEDIUM", overdue: false },
    { id: "t3", title: "Update shuttering checklist", dueDate: at(16, 30), priority: "LOW", overdue: false },
    { id: "t4", title: "Safety walk with contractor", dueDate: at(9), priority: "HIGH", overdue: true },
  ],
  deliveries: [
    { id: "d1", poNumber: "PO-1182", supplierName: "UltraTech Cement", expectedDate: now.toISOString() },
    { id: "d2", poNumber: "PO-1190", supplierName: "JSW Steel", expectedDate: now.toISOString() },
  ],
};

const pulse: PulseData = {
  totals: { budget: 385_000_000, spent: 241_000_000, crew: 214, atRisk: 2 },
  projects: [
    { id: "p1", name: "Skyline Tower", status: "ACTIVE", budget: 180_000_000, spent: 128_000_000, burn: 71, schedule: 62, dprBacklog: 3, reqBacklog: 2, crew: 86, risk: 0.78, flag: "over" },
    { id: "p2", name: "Green Valley Ph-2", status: "ACTIVE", budget: 95_000_000, spent: 52_000_000, burn: 55, schedule: 58, dprBacklog: 1, reqBacklog: 0, crew: 54, risk: 0.42, flag: "watch" },
    { id: "p3", name: "Lakeview Villas", status: "ACTIVE", budget: 62_000_000, spent: 31_000_000, burn: 50, schedule: 55, dprBacklog: 0, reqBacklog: 1, crew: 38, risk: 0.3, flag: "ok" },
    { id: "p4", name: "Metro Plaza", status: "ACTIVE", budget: 48_000_000, spent: 30_000_000, burn: 63, schedule: 49, dprBacklog: 2, reqBacklog: 3, crew: 36, risk: 0.66, flag: "watch" },
  ],
};

const pipeline: PipelineData = {
  stages: [
    { id: "requisitions", label: "Requisitions", sub: "awaiting quotes", count: 9, oldestDays: 6, oldestRef: "REQ-0441", href: "/m/procurement" },
    { id: "quotes", label: "Quotations", sub: "under comparison", count: 6, oldestDays: 3, oldestRef: "QT-0212", href: "/m/procurement" },
    { id: "po-approval", label: "PO Approval", sub: "with director", count: 4, oldestDays: 8, oldestRef: "PO-1190", href: "/m/procurement" },
    { id: "in-transit", label: "In Transit", sub: "on the road", count: 7, oldestDays: 2, oldestRef: "PO-1178", href: "/m/procurement" },
    { id: "inspection", label: "Inspection", sub: "at gate", count: 3, oldestDays: 1, oldestRef: "GRN-3301", href: "/m/procurement" },
    { id: "invoices", label: "Invoices", sub: "unmatched bills", count: 11, oldestDays: 12, oldestRef: "INV-0892", href: "/m/books/finance" },
  ],
};

const funnel: FunnelData = {
  stages: [
    { id: "new", label: "New leads", count: 34, value: 12_400_000 },
    { id: "contacted", label: "Contacted", count: 22, value: 9_800_000 },
    { id: "visit", label: "Site visit", count: 14, value: 7_200_000 },
    { id: "negotiation", label: "Negotiation", count: 7, value: 5_600_000 },
    { id: "booking", label: "Booking", count: 3, value: 2_900_000 },
  ],
  lost: 5,
  won: { count: 8, value: 6_400_000 },
  followUps: [
    { id: "f1", name: "Anil Kapoor", phone: "98xxxxxx21", stage: "Negotiation", priority: "HIGH", dueAt: at(10), overdue: true },
    { id: "f2", name: "Meera Joshi", phone: "98xxxxxx87", stage: "Site visit", priority: "MEDIUM", dueAt: at(15), overdue: false },
    { id: "f3", name: "Farhan Ali", phone: "98xxxxxx44", stage: "Contacted", priority: "LOW", dueAt: at(17), overdue: false },
  ],
};

const cash: CashData = {
  inflow: 4_820_000,
  outflow: 3_960_000,
  net: 860_000,
  breakdown: { sales: 3_400_000, rent: 1_420_000, expenses: 2_150_000, suppliers: 1_810_000 },
  aging: [
    { id: "due", label: "Due now", amount: 640_000, count: 5 },
    { id: "d30", label: "1–30d", amount: 1_180_000, count: 9 },
    { id: "d60", label: "31–60d", amount: 520_000, count: 4 },
    { id: "d90", label: "61–90d", amount: 310_000, count: 3 },
    { id: "d90p", label: "90d+", amount: 470_000, count: 6 },
  ],
  payableTotal: 3_120_000,
  pending: { expenses: 14 },
};

const muster: MusterData = {
  headcount: { totalActive: 214, present: 172, half: 6, leave: 11, absent: 14, unmarked: 11 },
  sites: [
    { id: "s1", name: "Skyline Tower", present: 86, absent: 5, leave: 4 },
    { id: "s2", name: "Green Valley Ph-2", present: 54, absent: 4, leave: 3 },
    { id: "s3", name: "Lakeview Villas", present: 32, absent: 5, leave: 4 },
  ],
  pending: { leaves: 7 },
};

const SECTIONS: { id: string; label: string; node: React.ReactNode }[] = [
  { id: "field", label: "Field — Shift Rail", node: <ShiftRail data={shift} /> },
  { id: "ops", label: "Ops — Project Pulse", node: <ProjectPulse data={pulse} /> },
  { id: "procurement", label: "Procurement — Pipeline Flow", node: <PipelineFlow data={pipeline} /> },
  { id: "sales", label: "Sales — Deal Funnel", node: <DealFunnel data={funnel} /> },
  { id: "finance", label: "Finance — Cash Position", node: <CashPosition data={cash} /> },
  { id: "hr", label: "HR — Muster Ring", node: <MusterRing data={muster} /> },
];

export default function SigPreviewPage() {
  return (
    <div className="mx-auto max-w-[400px] px-3 py-6 space-y-8 min-h-screen" style={{ backgroundColor: "var(--color-paper-2)" }}>
      {SECTIONS.map((s) => (
        <div key={s.id} data-shot={s.id}>
          <p className="text-m-micro font-bold uppercase tracking-wider mb-2 px-1" style={{ color: "var(--color-ink-400)" }}>
            {s.label}
          </p>
          {s.node}
        </div>
      ))}
    </div>
  );
}
