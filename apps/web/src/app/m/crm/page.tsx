import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { Users, Phone, UserPlus, TrendingUp } from "lucide-react";
import {
  MobileSectionTitle,
  MobileRow,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import { formatCurrencyCompact } from "@/lib/utils";

/**
 * /m/crm — mobile CRM hub.
 * Single entry point for salespeople: leads, calls, customers, and sales.
 * Replaces the need to navigate to separate sections.
 */
export default async function MobileCrmPage() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canSales = hasPermission(role, PERM.SALES_VIEW) || hasPermission(role, PERM.SALES_MANAGE);

  if (!canSales) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        You don&apos;t have access to CRM.
      </div>
    );
  }

  // Fetch counts for the hub cards
  const [openLeads, todayCalls, totalCustomers, activeSales] = await Promise.all([
    prisma.lead.count({
      where: { companyId: company.id, stage: { in: ["NEW", "CONTACTED", "SITE_VISIT", "NEGOTIATION"] }, deletedAt: null },
    }),
    prisma.callLog.count({
      where: { companyId: company.id, startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.customer.count({
      where: { companyId: company.id, deletedAt: null },
    }),
    prisma.assetSale.count({
      where: { companyId: company.id, status: "ACTIVE" },
    }),
  ]);

  // Total outstanding from active sales
  const sales = await prisma.assetSale.findMany({
    where: { companyId: company.id, status: "ACTIVE" },
    select: { salePrice: true, gstAmount: true, payments: { select: { amount: true, status: true, chequeStatus: true } },
    },
  });
  const totalOutstanding = sales.reduce((sum, s) => {
    const total = toNum(s.salePrice) + toNum(s.gstAmount);
    const paid = s.payments
      .filter((p) => p.status !== "BOUNCED" && p.chequeStatus !== "BOUNCED" && p.chequeStatus !== "PENDING")
      .reduce((sp, p) => sp + toNum(p.amount), 0);
    return sum + Math.max(0, total - paid);
  }, 0);

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-2">
        <MobileStatCard label="Open Leads" value={String(openLeads)} icon={UserPlus} tone="signal" />
        <MobileStatCard label="Calls Today" value={String(todayCalls)} icon={Phone} tone="signal" />
        <MobileStatCard label="Customers" value={String(totalCustomers)} icon={Users} />
        <MobileStatCard label="Active Sales" value={String(activeSales)} icon={TrendingUp} />
      </div>

      {totalOutstanding > 0 && (
        <div
          className="rounded-[0.5rem] border p-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Outstanding Receivables</p>
          <p className="text-m-section font-bold tnum" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrencyCompact(totalOutstanding)}
          </p>
        </div>
      )}

      {/* ── Quick actions ── */}
      <MobileSectionTitle>Quick Actions</MobileSectionTitle>
      <div className="flex flex-col gap-2">
        <Link href="/m/customers">
          <MobileRow
            icon={Users}
            title="Customers & Leads"
            subtitle="Browse directory, add new customers, manage leads"
            meta={String(totalCustomers)}
            metaSub="customers"
            tone="default"
          />
        </Link>
        <Link href="/m/leads/new">
          <MobileRow
            icon={UserPlus}
            title="Add New Lead"
            subtitle="Capture a new prospect — name, phone, project interest"
            tone="default"
          />
        </Link>
        <Link href="/m/calls">
          <MobileRow
            icon={Phone}
            title="Call Log"
            subtitle="Schedule and log calls with customers and leads"
            meta={String(todayCalls)}
            metaSub="today"
            tone="default"
          />
        </Link>
        <Link href="/m/sales">
          <MobileRow
            icon={TrendingUp}
            title="Sales Pipeline"
            subtitle="Active sales, payments, and collection tracking"
            meta={String(activeSales)}
            metaSub="active"
            tone="default"
          />
        </Link>
      </div>
    </div>
  );
}
