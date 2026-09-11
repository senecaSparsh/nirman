"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Building2, MapPin, Users, Network, Shield,
  Layers, History, Pencil, Save, Loader2, Plus, Trash2, UserPlus,
  ChevronDown, Phone, Mail, Globe, Hash, FileText, Lock, RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { canAssignRole, ROLE_META, type Role } from "@/lib/roles";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { useConfirm } from "@/lib/use-confirm";
import type { CompanyProfileData } from "@/components/companies/company-profile-client";
import { SectionCard, UnderlineInput, EnumSelect } from "@/components/mobile/v2/form-primitives";
import { Badge, MobileNoAccess, MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE COMPANY DETAILS — comprehensive management page

   Mobile equivalent of the desktop CompanyProfileClient. Instead of tabs,
   uses collapsible sections (accordion) so the owner can manage everything
   related to the company in one scrollable page:
     1. Company Identity (edit name, GSTIN, PAN, address, phone, email)
     2. Members & Access (add/remove, change roles)
     3. Hierarchy (parent + siblings — where this company sits in the org tree)
     4. Child Companies (manage subsidiaries — list, create, delete)
     5. Locations (stock locations table)
     6. Policy & Security (password policy, call recording)
     7. Procurement (LCI threshold, PO approval thresholds)
     8. Integrations (external service connections)
     9. Activity & Audit (audit log, backups)
   ═══════════════════════════════════════════════════════════════════════════ */

const LOCATION_TYPE_LABELS: Record<string, string> = {
  COMPANY_WAREHOUSE: "Warehouse",
  PROJECT_SITE: "Project Site",
  DEPARTMENT: "Dept Store",
  VEHICLE: "Vehicle",
};

export function MobileCompanyDetails({
  data,
  actorRole,
  permissions,
  roleOptions,
  assignableRoles: assignable,
}: {
  data: CompanyProfileData;
  actorRole: string;
  permissions: {
    canManage: boolean;
    canViewAudit: boolean;
    canManageTelephony: boolean;
    canManageCompanies: boolean;
    canManageHr: boolean;
    canManageProcurement: boolean;
    canManageSales: boolean;
    canManageInventory: boolean;
    canManageProjects: boolean;
  };
  roleOptions: { key: string; label: string }[];
  assignableRoles: Role[];
}) {
  if (!permissions.canManage) {
    return <MobileNoAccess what="company details" />;
  }

  return (
    <div className="flex flex-col gap-3 p-3 pb-20">
      {/* ── Hero ── */}
      <CompanyHero data={data} />

      {/* ── Stats grid ── */}
      <StatsGrid data={data} permissions={permissions} />

      {/* ── Sections ── */}
      <IdentitySection data={data} canManage={permissions.canManage} />
      <MembersSection
        data={data}
        canManage={permissions.canManage}
        actorRole={actorRole}
        roleOptions={roleOptions}
        assignable={assignable}
      />
      {data.parentName || data.siblings.length > 0 ? (
        <HierarchySection data={data} />
      ) : null}
      <ChildCompaniesSection data={data} canManage={permissions.canManageCompanies} />
      <LocationsSection data={data} canManage={permissions.canManageInventory} />
      <PolicySection data={data} canManage={permissions.canManage} canManageTelephony={permissions.canManageTelephony} />
      <ProcurementSection data={data} canManage={permissions.canManage} />
      <IntegrationsSection />
      {permissions.canViewAudit && <AuditSection data={data} />}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Hero
// ───────────────────────────────────────────────────────────────

function CompanyHero({ data }: { data: CompanyProfileData }) {
  const router = useRouter();
  return (
    <div
      className="rounded-[0.75rem] border p-3 flex items-center gap-3"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div
        className="grid place-items-center w-12 h-12 rounded-[0.5rem] shrink-0 text-m-section font-bold"
        style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
      >
        {data.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-m-section font-extrabold truncate" style={{ color: "var(--color-ink-950)" }}>
          {data.name}
          {!data.isCurrentCompany && (
            <Badge tone="neutral" className="ml-1.5">child company</Badge>
          )}
        </p>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {data.businessType && (
            <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              {data.businessType}
            </span>
          )}
          <span className="text-m-caption flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
            <Globe className="size-2.5" /> {data.currency}
          </span>
          <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            Since {formatDate(data.createdAt)}
          </span>
        </div>
      </div>
      {!data.isCurrentCompany && (
        <button
          onClick={async () => {
            try {
              const res = await fetch("/api/companies/switch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId: data.id }),
              });
              if (res.ok) router.refresh();
            } catch {
              toast.error("Failed to switch company");
            }
          }}
          className="flex items-center gap-1 rounded-[0.5rem] px-2.5 py-2 text-m-caption font-bold text-m-body press shrink-0"
          style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
        >
          <RefreshCw className="size-3" /> Switch
        </button>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Stats grid
// ───────────────────────────────────────────────────────────────

function StatsGrid({ data, permissions }: { data: CompanyProfileData; permissions: { canManage: boolean; canManageHr: boolean; canManageProcurement: boolean; canManageSales: boolean; canManageInventory: boolean; canManageProjects: boolean } }) {
  const [openKpi, setOpenKpi] = React.useState<string | null>(null);
  const stats: { key: string; label: string; value: string }[] = [
    { key: "members", label: "team", value: String(data.stats.members) },
    { key: "projects", label: "projects", value: String(data.stats.projects) },
    { key: "locations", label: "locations", value: String(data.stats.locations) },
    { key: "employees", label: "staff", value: String(data.stats.employees) },
    { key: "suppliers", label: "suppliers", value: String(data.stats.suppliers) },
    { key: "customers", label: "customers", value: String(data.stats.customers) },
  ];
  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        {stats.map((s) => (
          <button
            key={s.key}
            onClick={() => { haptic(10); setOpenKpi(s.key); }}
            className="rounded-[0.5rem] border p-2 flex flex-col items-center gap-0.5 press text-left"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <span className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {s.value}
            </span>
            <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              {s.label}
            </span>
          </button>
        ))}
      </div>
      <KpiDialog kpi={openKpi} onClose={() => setOpenKpi(null)} data={data} permissions={permissions} />
    </>
  );
}

// ───────────────────────────────────────────────────────────────
//  KPI dialog — popup overview when a stat card is tapped
// ───────────────────────────────────────────────────────────────

function KpiDialog({
  kpi,
  onClose,
  data,
  permissions,
}: {
  kpi: string | null;
  onClose: () => void;
  data: CompanyProfileData;
  permissions: { canManage: boolean; canManageHr: boolean; canManageProcurement: boolean; canManageSales: boolean; canManageInventory: boolean; canManageProjects: boolean };
}) {
  if (!kpi) return null;

  const titles: Record<string, string> = {
    members: "Team & Access",
    projects: "Projects",
    locations: "Stock Locations",
    employees: "Staff (HR)",
    suppliers: "Suppliers",
    customers: "Customers",
  };

  return (
    <MobileDialog open={!!kpi} onClose={onClose} title={titles[kpi] ?? kpi}>
      <div className="flex flex-col gap-2 p-1 max-h-[60vh] overflow-y-auto">
        {kpi === "members" && <MembersOverview data={data} canManage={permissions.canManage} />}
        {kpi === "projects" && <ProjectsOverview data={data} canManage={permissions.canManageProjects} />}
        {kpi === "locations" && <LocationsOverview data={data} canManage={permissions.canManageInventory} />}
        {kpi === "employees" && <EmployeesOverview canManage={permissions.canManageHr} />}
        {kpi === "suppliers" && <SuppliersOverview canManage={permissions.canManageProcurement} />}
        {kpi === "customers" && <CustomersOverview canManage={permissions.canManageSales} />}
      </div>
    </MobileDialog>
  );
}

// ── Members overview ──
function MembersOverview({ data, canManage }: { data: CompanyProfileData; canManage: boolean }) {
  if (data.members.length === 0) return <MobileEmptyState icon={Users} title="No team members yet" size="compact" />;
  return (
    <>
      <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
        {data.members.length} people with login access to this company
      </p>
      {data.members.slice(0, 10).map((m) => (
        <div key={m.id} className="rounded-[0.5rem] border p-2 flex items-center gap-2" style={{ borderColor: "var(--color-line)" }}>
          <div className="min-w-0 flex-1">
            <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>{m.name}</p>
            <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>{m.email}</p>
          </div>
          <Badge tone="neutral" className="shrink-0">{ROLE_META[m.role as Role]?.label ?? m.role}</Badge>
        </div>
      ))}
      {data.members.length > 10 && (
        <p className="text-m-caption text-center" style={{ color: "var(--color-ink-400)" }}>
          Showing 10 of {data.members.length}
        </p>
      )}
      {!canManage && (
        <p className="text-m-caption text-center" style={{ color: "var(--color-ink-400)" }}>
          Only owners/admins can manage team access
        </p>
      )}
    </>
  );
}

// ── Projects overview (with FAB for project creation) ──
function ProjectsOverview({ data, canManage }: { data: CompanyProfileData; canManage: boolean }) {
  const fab = useFabModal();
  if (data.projects.length === 0 && !canManage) return <MobileEmptyState icon={Building2} title="No projects yet" size="compact" />;
  return (
    <>
      {data.projects.length === 0 ? (
        <MobileEmptyState icon={Building2} title="No projects yet" size="compact" />
      ) : (
        <>
          <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            {data.projects.length} project{data.projects.length > 1 ? "s" : ""}
          </p>
          {data.projects.slice(0, 10).map((p) => (
            <div key={p.id} className="rounded-[0.5rem] border p-2 flex items-center gap-2" style={{ borderColor: "var(--color-line)" }}>
              <Building2 className="size-3.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
              <span className="text-m-section font-bold truncate flex-1" style={{ color: "var(--color-ink-950)" }}>{p.name}</span>
              <Badge tone={p.status === "ACTIVE" ? "go" : "neutral"} className="shrink-0">{p.status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>
            </div>
          ))}
          {data.projects.length > 10 && (
            <p className="text-m-caption text-center" style={{ color: "var(--color-ink-400)" }}>
              Showing 10 of {data.projects.length}
            </p>
          )}
        </>
      )}
      {canManage && (
        <button
          onClick={fab.toggle}
          className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold border-2 border-dashed text-m-body press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
        >
          <Plus className="size-3.5" /> New Project
        </button>
      )}
      {canManage && (
        <MobileFabModal open={fab.isOpen} onClose={fab.close} originRect={fab.originRect} title="New Project">
          <MobileNewProjectDialog open={fab.isOpen} onClose={fab.close} />
        </MobileFabModal>
      )}
    </>
  );
}

// ── Locations overview ──
function LocationsOverview({ data, canManage }: { data: CompanyProfileData; canManage: boolean }) {
  if (data.locations.length === 0) return <MobileEmptyState icon={MapPin} title="No locations yet" size="compact" />;
  return (
    <>
      <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
        {data.locations.length} location{data.locations.length > 1 ? "s" : ""}
      </p>
      {data.locations.slice(0, 10).map((l) => (
        <div key={l.id} className="rounded-[0.5rem] border p-2 flex flex-col gap-0.5" style={{ borderColor: "var(--color-line)" }}>
          <div className="flex items-center gap-2">
            <span className="text-m-section font-bold truncate flex-1" style={{ color: "var(--color-ink-950)" }}>{l.name}</span>
            <Badge tone="neutral" className="shrink-0">{LOCATION_TYPE_LABELS[l.type] ?? l.type}</Badge>
          </div>
          <div className="flex items-center gap-3 text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            <span className="tabular-nums">{l.itemCount} items</span>
            <span className="ml-auto tabular-nums font-bold" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrency(l.stockValue, data.currency)}
            </span>
          </div>
        </div>
      ))}
      {!canManage && (
        <p className="text-m-caption text-center" style={{ color: "var(--color-ink-400)" }}>
          Only inventory managers can add locations
        </p>
      )}
    </>
  );
}

// ── Fetch-on-demand overview (employees, suppliers, customers) ──

function useFetchList<T>(url: string | null): { items: T[]; loading: boolean; error: string | null } {
  const [items, setItems] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!url) return;
    setLoading(true);
    setError(null);
    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? "Failed to load");
        }
        return r.json();
      })
      .then((d) => { setItems(Array.isArray(d) ? d : (d.items ?? [])); })
      .catch((e) => { setError(e instanceof Error ? e.message : "Failed"); })
      .finally(() => setLoading(false));
  }, [url]);
  return { items, loading, error };
}

function EmployeesOverview({ canManage }: { canManage: boolean }) {
  const { items, loading, error } = useFetchList<{ id: string; name: string; trade: string | null; active: boolean; designation: string | null }>("/api/employees?active=true");
  if (loading) return <div className="flex items-center justify-center py-6"><Loader2 className="size-5 animate-spin" style={{ color: "var(--color-ink-500)" }} /></div>;
  if (error) return <p className="text-m-caption text-center py-4" style={{ color: "var(--color-stop)" }}>{error}</p>;
  if (items.length === 0) return <MobileEmptyState icon={Users} title="No staff yet" size="compact" />;
  return (
    <>
      <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
        {items.length} HR record{items.length > 1 ? "s" : ""} — payroll, trades, attendance
      </p>
      {items.slice(0, 10).map((e) => (
        <div key={e.id} className="rounded-[0.5rem] border p-2 flex items-center gap-2" style={{ borderColor: "var(--color-line)" }}>
          <div className="min-w-0 flex-1">
            <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>{e.name}</p>
            <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>{e.designation ?? e.trade ?? "—"}</p>
          </div>
          {!e.active && <Badge tone="neutral" className="shrink-0">inactive</Badge>}
        </div>
      ))}
      {items.length > 10 && <p className="text-m-caption text-center" style={{ color: "var(--color-ink-400)" }}>Showing 10 of {items.length}</p>}
      {!canManage && <p className="text-m-caption text-center" style={{ color: "var(--color-ink-400)" }}>Only HR managers can add staff</p>}
    </>
  );
}

function SuppliersOverview({ canManage }: { canManage: boolean }) {
  const { items, loading, error } = useFetchList<{ id: string; name: string; phone: string | null; poCount: number }>("/api/mobile/list/suppliers");
  if (loading) return <div className="flex items-center justify-center py-6"><Loader2 className="size-5 animate-spin" style={{ color: "var(--color-ink-500)" }} /></div>;
  if (error) return <p className="text-m-caption text-center py-4" style={{ color: "var(--color-stop)" }}>{error}</p>;
  if (items.length === 0) return <MobileEmptyState icon={Building2} title="No suppliers yet" size="compact" />;
  return (
    <>
      <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{items.length} supplier{items.length > 1 ? "s" : ""}</p>
      {items.slice(0, 10).map((s) => (
        <div key={s.id} className="rounded-[0.5rem] border p-2 flex items-center gap-2" style={{ borderColor: "var(--color-line)" }}>
          <div className="min-w-0 flex-1">
            <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>{s.name}</p>
            <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>{s.phone ?? "—"}</p>
          </div>
          {s.poCount > 0 && <Badge tone="signal" className="shrink-0">{s.poCount} PO{s.poCount > 1 ? "s" : ""}</Badge>}
        </div>
      ))}
      {items.length > 10 && <p className="text-m-caption text-center" style={{ color: "var(--color-ink-400)" }}>Showing 10 of {items.length}</p>}
      {!canManage && <p className="text-m-caption text-center" style={{ color: "var(--color-ink-400)" }}>Only procurement managers can add suppliers</p>}
    </>
  );
}

function CustomersOverview({ canManage }: { canManage: boolean }) {
  const { items, loading, error } = useFetchList<{ id: string; name: string; phone: string | null; outstanding: number; dueCount: number }>("/api/mobile/list/customers");
  if (loading) return <div className="flex items-center justify-center py-6"><Loader2 className="size-5 animate-spin" style={{ color: "var(--color-ink-500)" }} /></div>;
  if (error) return <p className="text-m-caption text-center py-4" style={{ color: "var(--color-stop)" }}>{error}</p>;
  if (items.length === 0) return <MobileEmptyState icon={Users} title="No customers yet" size="compact" />;
  return (
    <>
      <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{items.length} customer{items.length > 1 ? "s" : ""}</p>
      {items.slice(0, 10).map((c) => (
        <div key={c.id} className="rounded-[0.5rem] border p-2 flex items-center gap-2" style={{ borderColor: "var(--color-line)" }}>
          <div className="min-w-0 flex-1">
            <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>{c.name}</p>
            <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>{c.phone ?? "—"}</p>
          </div>
          {c.dueCount > 0 && <Badge tone="stop" className="shrink-0">{c.dueCount} due</Badge>}
        </div>
      ))}
      {items.length > 10 && <p className="text-m-caption text-center" style={{ color: "var(--color-ink-400)" }}>Showing 10 of {items.length}</p>}
      {!canManage && <p className="text-m-caption text-center" style={{ color: "var(--color-ink-400)" }}>Only sales managers can add customers</p>}
    </>
  );
}

// ───────────────────────────────────────────────────────────────
//  Collapsible section wrapper
// ───────────────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: LucideIcon;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div
      className="rounded-[0.625rem] border overflow-hidden"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <button
        onClick={() => { haptic(10); setOpen(!open); }}
        className="w-full flex items-center gap-2 p-3 press text-left"
      >
        <Icon className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
        <span className="text-m-section font-bold flex-1" style={{ color: "var(--color-ink-950)" }}>
          {title}
          {count != null && count > 0 && (
            <span
              className="ml-1.5 text-m-caption font-normal px-1.5 py-0.5 rounded-[0.25rem]"
              style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
            >
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          className="size-4 shrink-0 transition-transform"
          style={{
            color: "var(--color-ink-500)",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>
      {open && <div className="px-3 pb-3 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Identity section
// ───────────────────────────────────────────────────────────────

function IdentitySection({ data, canManage }: { data: CompanyProfileData; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState({
    name: data.name,
    gstin: data.gstin ?? "",
    pan: data.pan ?? "",
    address: data.address ?? "",
    phone: data.phone ?? "",
    email: data.email ?? "",
    currency: data.currency,
    businessType: data.businessType ?? "",
  });
  const [saving, setSaving] = React.useState(false);

  async function save() {
    if (!form.name.trim()) { toast.error("Company name is required"); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error("Invalid email"); return; }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch(`/api/companies/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          gstin: form.gstin.trim() || null,
          pan: form.pan.trim() || null,
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          currency: form.currency,
          businessType: form.businessType.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      haptic([10, 40, 80]);
      toast.success("Company details saved");
      setEditing(false);
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection title="Company Identity" icon={Building2} defaultOpen>
      {editing ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <UnderlineInput label="Company Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required placeholder="e.g. ABP Realty" />
            <UnderlineInput label="Business Type" value={form.businessType} onChange={(v) => setForm((f) => ({ ...f, businessType: v }))} placeholder="Real Estate" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <UnderlineInput label="GSTIN" value={form.gstin} onChange={(v) => setForm((f) => ({ ...f, gstin: v.toUpperCase() }))} placeholder="22AAAAA0000A1Z5" maxLength={15} />
            <UnderlineInput label="PAN" value={form.pan} onChange={(v) => setForm((f) => ({ ...f, pan: v.toUpperCase() }))} placeholder="AAAAA0000A" maxLength={10} />
          </div>
          <UnderlineInput label="Address" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} placeholder="Registered office address" />
          <div className="grid grid-cols-2 gap-2">
            <UnderlineInput label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="+91 98765 43210" type="tel" inputMode="tel" />
            <UnderlineInput label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="accounts@co.com" type="email" inputMode="email" />
          </div>
          <EnumSelect
            label="Currency"
            value={form.currency}
            onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
            options={["INR", "USD", "EUR", "GBP", "AED"].map((c) => ({ value: c, label: c }))}
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex-1 rounded-[0.5rem] py-2.5 text-m-section font-bold border-2 text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <DetailRow icon={Building2} label="Name" value={data.name} />
          <DetailRow icon={Layers} label="Business Type" value={data.businessType} />
          <DetailRow icon={Hash} label="GSTIN" value={data.gstin} />
          <DetailRow icon={FileText} label="PAN" value={data.pan} />
          <DetailRow icon={Phone} label="Phone" value={data.phone} />
          <DetailRow icon={Mail} label="Email" value={data.email} />
          <DetailRow icon={Globe} label="Currency" value={data.currency} />
          <DetailRow icon={MapPin} label="Address" value={data.address} />
          {canManage && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold border-2 text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              <Pencil className="size-3.5" /> Edit Details
            </button>
          )}
        </>
      )}
    </CollapsibleSection>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Icon className="size-3.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
      <span className="text-m-caption font-semibold shrink-0" style={{ color: "var(--color-ink-500)" }}>
        {label}
      </span>
      <span className="text-m-caption ml-auto text-right truncate" style={{ color: "var(--color-ink-950)" }}>
        {value || <span style={{ color: "var(--color-ink-400)" }}>—</span>}
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Members section
// ───────────────────────────────────────────────────────────────

function MembersSection({
  data, canManage, actorRole, roleOptions, assignable,
}: {
  data: CompanyProfileData;
  canManage: boolean;
  actorRole: string;
  roleOptions: { key: string; label: string }[];
  assignable: Role[];
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [addOpen, setAddOpen] = React.useState(false);
  const [addEmail, setAddEmail] = React.useState("");
  const [addRole, setAddRole] = React.useState<Role>(assignable[0] ?? "PROJECT_MANAGER");
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<string | null>(null);

  async function addMember() {
    if (!addEmail.trim()) { toast.error("Email is required"); return; }
    setAdding(true);
    try {
      const res = await fetch(`/api/companies/${data.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add member");
      toast.success("Member added");
      setAddOpen(false);
      setAddEmail("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setAdding(false);
    }
  }

  async function changeRole(memberId: string, role: string) {
    try {
      const res = await fetch(`/api/companies/${data.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Role updated");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function removeMember(memberId: string, name: string) {
    const ok = await confirm({
      title: `Revoke access for ${name}?`,
      description: "They will lose access to this company only. Their user account and memberships in other companies are preserved.",
      confirmLabel: "Revoke Access",
      variant: "destructive",
    });
    if (!ok) return;
    setRemoving(memberId);
    try {
      const res = await fetch(`/api/companies/${data.id}/members/${memberId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Access revoked");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <CollapsibleSection title="Members & Access" icon={Users} count={data.members.length}>
      {canManage && assignable.length > 0 && (
        <>
          <button
            onClick={() => setAddOpen(!addOpen)}
            className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold border-2 border-dashed text-m-body press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            <UserPlus className="size-3.5" /> Add Member
          </button>
          {addOpen && (
            <div className="rounded-[0.5rem] border p-3 flex flex-col gap-2" style={{ borderColor: "var(--color-line)" }}>
              <UnderlineInput label="Email" value={addEmail} onChange={setAddEmail} placeholder="user@example.com" type="email" inputMode="email" />
              <EnumSelect
                label="Role"
                value={addRole}
                onChange={(v) => setAddRole(v as Role)}
                options={assignable.map((r) => {
                  const def = roleOptions.find((o) => o.key === r);
                  return { value: r, label: def?.label ?? r };
                })}
              />
              <button
                onClick={addMember}
                disabled={adding}
                className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
              >
                {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-3.5" />}
                Add
              </button>
            </div>
          )}
        </>
      )}

      {data.members.length === 0 ? (
        <MobileEmptyState icon={Users} title="No members yet" size="compact" />
      ) : (
        <div className="flex flex-col gap-1.5">
          {data.members.map((m) => {
            const scopeLabel =
              m.scopeType === "DEPARTMENT" ? `Dept${m.scopes.length > 1 ? `s (${m.scopes.length})` : ""}` :
              m.scopeType === "PROJECT" ? `Site${m.scopes.length > 1 ? `s (${m.scopes.length})` : ""}` :
              "Company-wide";
            return (
              <div
                key={m.id}
                className="rounded-[0.5rem] border p-2.5 flex flex-col gap-1"
                style={{ borderColor: "var(--color-line)" }}
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                      {m.name}
                      {!m.active && <Badge tone="neutral" className="ml-1.5">inactive</Badge>}
                    </p>
                    <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                      {m.email}
                    </p>
                  </div>
                  {canManage && canAssignRole(actorRole, m.role) ? (
                    <EnumSelect
                      label=""
                      value={m.role}
                      onChange={(v) => changeRole(m.id, v)}
                      options={[m.role, ...assignable].filter((r, i, arr) => arr.indexOf(r) === i).map((r) => {
                        const def = roleOptions.find((o) => o.key === r);
                        return { value: r, label: def?.label ?? r };
                      })}
                      inline
                    />
                  ) : (
                    <Badge tone="neutral" className="shrink-0">
                      {roleOptions.find((o) => o.key === m.role)?.label ?? m.role}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                    {scopeLabel}
                  </span>
                  {m.reportsToName && (
                    <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                      · reports to {m.reportsToName}
                    </span>
                  )}
                  <span className="text-m-caption ml-auto" style={{ color: "var(--color-ink-400)" }}>
                    {m.lastLoginAt ? formatDate(m.lastLoginAt) : "never"}
                  </span>
                </div>
                {canManage && (
                  <button
                    onClick={() => removeMember(m.id, m.name)}
                    disabled={removing === m.id}
                    className="self-start flex items-center gap-1 text-m-caption font-bold press disabled:opacity-50 mt-0.5"
                    style={{ color: "var(--color-stop)" }}
                  >
                    {removing === m.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                    Revoke
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {confirmDialog}
    </CollapsibleSection>
  );
}

// ───────────────────────────────────────────────────────────────
//  Hierarchy section — where this company sits in the org tree
// ───────────────────────────────────────────────────────────────

function HierarchySection({ data }: { data: CompanyProfileData }) {
  return (
    <CollapsibleSection title="Hierarchy" icon={Network}>
      {/* Parent */}
      {data.parentName ? (
        <div className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-m-caption font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-500)" }}>
            Parent
          </p>
          <div className="flex items-center gap-2">
            <Building2 className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
              {data.parentName}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-m-caption font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-500)" }}>
            Parent
          </p>
          <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            Top-level company (no parent)
          </p>
        </div>
      )}

      {/* Siblings */}
      {data.siblings.length > 0 && (
        <div className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-m-caption font-bold uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-500)" }}>
            Siblings ({data.siblings.length})
          </p>
          <div className="flex flex-col gap-1">
            {data.siblings.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-1">
                <Building2 className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
                <span className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
                  {s.name}
                </span>
                {s.businessType && (
                  <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                    {s.businessType}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Position summary */}
      <p className="text-m-caption text-center" style={{ color: "var(--color-ink-500)" }}>
        {data.parentName
          ? `${data.name} is a child of ${data.parentName}`
          : `${data.name} is a top-level company`}
        {data.siblings.length > 0 && ` with ${data.siblings.length} sibling${data.siblings.length > 1 ? "s" : ""}`}
      </p>
    </CollapsibleSection>
  );
}

// ───────────────────────────────────────────────────────────────
//  Child companies section — manage subsidiaries
// ───────────────────────────────────────────────────────────────

function ChildCompaniesSection({ data, canManage }: { data: CompanyProfileData; canManage: boolean }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", businessType: "", currency: "INR" });
  const [saving, setSaving] = React.useState(false);

  async function createChild() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          businessType: form.businessType.trim() || null,
          parentCompanyId: data.id,
          currency: form.currency,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Child company created");
      // Switch to the new company so the user lands inside it
      await fetch("/api/company/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: json.id }),
      }).catch(() => {});
      window.dispatchEvent(new CustomEvent("nirman-company-switched"));
      setCreating(false);
      setForm({ name: "", businessType: "", currency: "INR" });
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteChild(id: string, name: string) {
    const ok = await confirm({
      title: `Delete "${name}"?`,
      description: "Soft-deletes the company. Companies with children cannot be deleted.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/companies/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Company deleted");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <CollapsibleSection title="Child Companies" icon={Building2} count={data.children.length}>
      {/* Children list */}
      <div className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)" }}>
        {data.children.length === 0 ? (
          <MobileEmptyState icon={Building2} title="No child companies" description={`Create a subsidiary under ${data.name}.`} size="compact" />
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.children.map((c) => (
              <div
                key={c.id}
                className="rounded-[0.5rem] border p-2.5 flex items-center gap-2"
                style={{ borderColor: "var(--color-line)" }}
              >
                <Building2 className="size-3.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {c.name}
                  </p>
                  {c.businessType && (
                    <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                      {c.businessType}
                    </p>
                  )}
                </div>
                <Badge tone="neutral" className="shrink-0">{c.memberCount}m</Badge>
                {c.hasChildren && <Badge tone="steel" className="shrink-0">parent</Badge>}
                {canManage && !c.hasChildren && (
                  <button
                    onClick={() => deleteChild(c.id, c.name)}
                    className="press shrink-0"
                    style={{ color: "var(--color-stop)" }}
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canManage && (
        <>
          <button
            onClick={() => setCreating(!creating)}
            className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold border-2 border-dashed text-m-body press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            <Plus className="size-3.5" /> New child company
          </button>
          {creating && (
            <div className="rounded-[0.5rem] border p-3 flex flex-col gap-2" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-m-caption font-bold" style={{ color: "var(--color-ink-700)" }}>
                New child under {data.name}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <UnderlineInput label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required placeholder="Child company name" />
                <UnderlineInput label="Business Type" value={form.businessType} onChange={(v) => setForm((f) => ({ ...f, businessType: v }))} placeholder="Real Estate" />
              </div>
              <EnumSelect
                label="Currency"
                value={form.currency}
                onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                options={["INR", "USD", "EUR", "GBP", "AED"].map((c) => ({ value: c, label: c }))}
              />
              <button
                onClick={createChild}
                disabled={saving}
                className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-3.5" />}
                Create
              </button>
            </div>
          )}
        </>
      )}
      {confirmDialog}
    </CollapsibleSection>
  );
}

// ───────────────────────────────────────────────────────────────
//  Locations section
// ───────────────────────────────────────────────────────────────

function LocationsSection({ data, canManage }: { data: CompanyProfileData; canManage: boolean }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", type: "COMPANY_WAREHOUSE" as "COMPANY_WAREHOUSE" | "PROJECT_SITE" | "DEPARTMENT", projectId: "", address: "" });
  const [saving, setSaving] = React.useState(false);

  async function addLocation() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/stock-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          projectId: form.type === "PROJECT_SITE" ? form.projectId || null : null,
          address: form.address.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Location added");
      setShowAdd(false);
      setForm({ name: "", type: "COMPANY_WAREHOUSE", projectId: "", address: "" });
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection title="Stock Locations" icon={MapPin} count={data.locations.length}>
      {data.locations.length === 0 ? (
        <MobileEmptyState icon={MapPin} title="No locations yet" size="compact" />
      ) : (
        <div className="flex flex-col gap-1.5">
          {data.locations.map((l) => (
            <div
              key={l.id}
              className="rounded-[0.5rem] border p-2.5 flex flex-col gap-1"
              style={{ borderColor: "var(--color-line)" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-m-section font-bold truncate flex-1" style={{ color: "var(--color-ink-950)" }}>
                  {l.name}
                </span>
                <Badge tone="neutral" className="shrink-0">
                  {LOCATION_TYPE_LABELS[l.type] ?? l.type}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                {l.projectName && <span>{l.projectName}</span>}
                <span className="ml-auto tabular-nums">{l.itemCount} items</span>
                <span className="tabular-nums font-bold" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrency(l.stockValue, data.currency)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {canManage && (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold border-2 border-dashed text-m-body press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
        >
          <Plus className="size-3.5" /> Add Location
        </button>
      )}
      <MobileDialog open={showAdd} onClose={() => setShowAdd(false)} title="New Stock Location">
        <div className="flex flex-col gap-3 p-1">
          <UnderlineInput label="Location Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required placeholder="e.g. Main Warehouse" />
          <EnumSelect
            label="Type"
            value={form.type}
            onChange={(v) => setForm((f) => ({ ...f, type: v as typeof form.type }))}
            options={[
              { value: "COMPANY_WAREHOUSE", label: "Company Warehouse" },
              { value: "PROJECT_SITE", label: "Project Site" },
              { value: "DEPARTMENT", label: "Department Store" },
            ]}
          />
          {form.type === "PROJECT_SITE" && (
            <EnumSelect
              label="Project"
              value={form.projectId}
              onChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
              placeholder="Select project…"
              options={data.projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
          <UnderlineInput label="Address" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} placeholder="Optional address" />
          <button
            onClick={addLocation}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-3.5" />}
            Add Location
          </button>
        </div>
      </MobileDialog>
    </CollapsibleSection>
  );
}

// ───────────────────────────────────────────────────────────────
//  Policy & Security section
// ───────────────────────────────────────────────────────────────

function PolicySection({
  data, canManage, canManageTelephony,
}: {
  data: CompanyProfileData;
  canManage: boolean;
  canManageTelephony: boolean;
}) {
  const router = useRouter();
  const [pw, setPw] = React.useState({
    passwordMinLength: data.passwordMinLength,
    passwordRequireSpecial: data.passwordRequireSpecial,
    passwordExpiryDays: data.passwordExpiryDays ?? 0,
    accountLockoutThreshold: data.accountLockoutThreshold,
    accountLockoutDurationMin: data.accountLockoutDurationMin,
  });
  const [rec, setRec] = React.useState({
    recordingConsentBeep: data.recordingConsentBeep,
    recordingRetentionDays: data.recordingRetentionDays,
    recordingAutoDelete: data.recordingAutoDelete,
    recordingStorageProvider: data.recordingStorageProvider,
  });
  const [savingPw, setSavingPw] = React.useState(false);
  const [savingRec, setSavingRec] = React.useState(false);

  async function savePassword() {
    setSavingPw(true);
    try {
      const res = await fetch(`/api/companies/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passwordMinLength: pw.passwordMinLength,
          passwordRequireSpecial: pw.passwordRequireSpecial,
          passwordExpiryDays: pw.passwordExpiryDays || null,
          accountLockoutThreshold: pw.accountLockoutThreshold,
          accountLockoutDurationMin: pw.accountLockoutDurationMin,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Password policy saved");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingPw(false);
    }
  }

  async function saveRecording() {
    setSavingRec(true);
    try {
      const res = await fetch(`/api/companies/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordingConsentBeep: rec.recordingConsentBeep,
          recordingRetentionDays: rec.recordingRetentionDays,
          recordingAutoDelete: rec.recordingAutoDelete,
          recordingStorageProvider: rec.recordingStorageProvider,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Recording config saved");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingRec(false);
    }
  }

  return (
    <CollapsibleSection title="Policy & Security" icon={Shield}>
      {/* Password policy */}
      <SectionCard title="Password Policy">
        <div className="grid grid-cols-2 gap-2">
          <UnderlineInput
            label="Min Length"
            value={String(pw.passwordMinLength)}
            onChange={(v) => setPw((f) => ({ ...f, passwordMinLength: Number(v) || 0 }))}
            type="number"
            inputMode="numeric"
          />
          <UnderlineInput
            label="Expiry (days)"
            value={String(pw.passwordExpiryDays)}
            onChange={(v) => setPw((f) => ({ ...f, passwordExpiryDays: Number(v) || 0 }))}
            type="number"
            inputMode="numeric"
          />
          <UnderlineInput
            label="Lockout Threshold"
            value={String(pw.accountLockoutThreshold)}
            onChange={(v) => setPw((f) => ({ ...f, accountLockoutThreshold: Number(v) || 0 }))}
            type="number"
            inputMode="numeric"
          />
          <UnderlineInput
            label="Lockout (min)"
            value={String(pw.accountLockoutDurationMin)}
            onChange={(v) => setPw((f) => ({ ...f, accountLockoutDurationMin: Number(v) || 0 }))}
            type="number"
            inputMode="numeric"
          />
        </div>
        <ToggleRow
          label="Require special characters"
          description="Off keeps passwords simple for field staff"
          checked={pw.passwordRequireSpecial}
          disabled={!canManage}
          onChange={(v) => setPw((f) => ({ ...f, passwordRequireSpecial: v }))}
        />
        {canManage && (
          <button
            onClick={savePassword}
            disabled={savingPw}
            className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {savingPw ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-3.5" />}
            Save Policy
          </button>
        )}
      </SectionCard>

      {/* Call recording */}
      <SectionCard title="Call Recording">
        <div className="flex items-center gap-2 rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)" }}>
          <Lock className="size-3.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-m-caption font-bold" style={{ color: "var(--color-ink-950)" }}>
              Recording mode
            </p>
            <Badge tone={data.recordingMode === "ALL" ? "go" : data.recordingMode === "SELECTED" ? "signal" : "neutral"}>
              {data.recordingMode === "ALL" ? "Everyone" : data.recordingMode === "SELECTED" ? "Selected staff" : "Disabled"}
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <UnderlineInput
            label="Retention (days)"
            value={String(rec.recordingRetentionDays)}
            onChange={(v) => setRec((f) => ({ ...f, recordingRetentionDays: Number(v) || 0 }))}
            type="number"
            inputMode="numeric"
          />
          <EnumSelect
            label="Storage"
            value={rec.recordingStorageProvider}
            onChange={(v) => setRec((f) => ({ ...f, recordingStorageProvider: v }))}
            options={[{ value: "local", label: "Local" }, { value: "s3", label: "S3" }]}
          />
        </div>
        <ToggleRow
          label="Play consent beep"
          description="Notice at call start"
          checked={rec.recordingConsentBeep}
          disabled={!canManageTelephony}
          onChange={(v) => setRec((f) => ({ ...f, recordingConsentBeep: v }))}
        />
        <ToggleRow
          label="Auto-delete after retention"
          description="Purge old recordings"
          checked={rec.recordingAutoDelete}
          disabled={!canManageTelephony}
          onChange={(v) => setRec((f) => ({ ...f, recordingAutoDelete: v }))}
        />
        {canManageTelephony && (
          <button
            onClick={saveRecording}
            disabled={savingRec}
            className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {savingRec ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-3.5" />}
            Save Recording Config
          </button>
        )}
      </SectionCard>
    </CollapsibleSection>
  );
}

function ToggleRow({
  label, description, checked, onChange, disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-[0.5rem] border p-2.5"
      style={{ borderColor: "var(--color-line)" }}
    >
      <div className="min-w-0">
        <p className="text-m-caption font-bold" style={{ color: "var(--color-ink-950)" }}>
          {label}
        </p>
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors press disabled:opacity-50"
        style={{ backgroundColor: checked ? "var(--color-ink-950)" : "var(--color-concrete)" }}
      >
        <span
          className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? "translateX(1rem)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Procurement section
// ───────────────────────────────────────────────────────────────

function ProcurementSection({ data, canManage }: { data: CompanyProfileData; canManage: boolean }) {
  const router = useRouter();
  const [form, setForm] = React.useState({
    lciThresholdDefault: data.lciThresholdDefault ?? 0,
    poApprovalThresholdManager: data.poApprovalThresholdManager ?? 0,
    poApprovalThresholdAdmin: data.poApprovalThresholdAdmin ?? 0,
  });
  const [previewAmount, setPreviewAmount] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lciThresholdDefault: form.lciThresholdDefault || null,
          poApprovalThresholdManager: form.poApprovalThresholdManager || null,
          poApprovalThresholdAdmin: form.poApprovalThresholdAdmin || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Procurement config saved");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const amount = Number(previewAmount) || 0;
  let requiredRole = "Owner";
  let reason = "";
  if (amount > 0) {
    if (data.poApprovalThresholdAdmin && amount >= data.poApprovalThresholdAdmin) {
      requiredRole = "Owner";
      reason = "at or above the admin threshold";
    } else if (data.poApprovalThresholdManager && amount >= data.poApprovalThresholdManager) {
      requiredRole = "Admin";
      reason = "above the manager threshold";
    } else {
      requiredRole = "Manager";
      reason = "below the manager threshold";
    }
  }

  return (
    <CollapsibleSection title="Procurement" icon={Layers}>
      <SectionCard title="Procurement Configuration">
        <UnderlineInput
          label="LCI Threshold Default (%)"
          value={form.lciThresholdDefault ? String(form.lciThresholdDefault) : ""}
          onChange={(v) => setForm((f) => ({ ...f, lciThresholdDefault: v === "" ? 0 : Number(v) }))}
          placeholder="e.g. 2"
          type="number"
          inputMode="decimal"
        />
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          Default Low-Cost Item threshold. Items below this % of project budget are auto-procured without a PO.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <UnderlineInput
            label={`PO Mgr (${data.currency})`}
            value={form.poApprovalThresholdManager ? String(form.poApprovalThresholdManager) : ""}
            onChange={(v) => setForm((f) => ({ ...f, poApprovalThresholdManager: v === "" ? 0 : Number(v) }))}
            placeholder="50000"
            type="number"
            inputMode="decimal"
          />
          <UnderlineInput
            label={`PO Admin (${data.currency})`}
            value={form.poApprovalThresholdAdmin ? String(form.poApprovalThresholdAdmin) : ""}
            onChange={(v) => setForm((f) => ({ ...f, poApprovalThresholdAdmin: v === "" ? 0 : Number(v) }))}
            placeholder="500000"
            type="number"
            inputMode="decimal"
          />
        </div>
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          Manager: POs below this can be approved by a Manager. Admin: POs at or above this require the Owner.
        </p>
        {canManage && (
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-3.5" />}
            Save
          </button>
        )}
      </SectionCard>

      {/* Approval routing preview */}
      <SectionCard title="Approval Routing Preview">
        <UnderlineInput
          label="PO Amount"
          value={previewAmount}
          onChange={setPreviewAmount}
          placeholder="75000"
          type="number"
          inputMode="decimal"
        />
        {amount > 0 && (
          <div
            className="flex items-center gap-2 rounded-[0.5rem] p-2.5"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <Shield className="size-3.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-m-caption" style={{ color: "var(--color-ink-700)" }}>
              Requires <span className="font-bold">{requiredRole}</span> — {reason}.
            </span>
          </div>
        )}
      </SectionCard>
    </CollapsibleSection>
  );
}

// ───────────────────────────────────────────────────────────────
//  Integrations section
// ───────────────────────────────────────────────────────────────

function IntegrationsSection() {
  return (
    <CollapsibleSection title="Integrations" icon={Layers}>
      <IntegrationsTab />
    </CollapsibleSection>
  );
}

// ───────────────────────────────────────────────────────────────
//  Audit section
// ───────────────────────────────────────────────────────────────

function AuditSection({ data }: { data: CompanyProfileData }) {
  return (
    <CollapsibleSection title="Activity & Audit" icon={History} count={data.auditLogs.length}>
      {/* Audit log */}
      <SectionCard title="Audit Log">
        {data.auditLogs.length === 0 ? (
          <MobileEmptyState icon={History} title="No audit entries yet" size="compact" />
        ) : (
          <div className="flex flex-col gap-1">
            {data.auditLogs.slice(0, 30).map((l) => (
              <div
                key={l.id}
                className="rounded-[0.5rem] border p-2 flex flex-col gap-0.5"
                style={{ borderColor: "var(--color-line)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-m-caption font-mono font-bold" style={{ color: "var(--color-ink-950)" }}>
                    {l.action}
                  </span>
                  <span className="text-m-caption ml-auto" style={{ color: "var(--color-ink-400)" }}>
                    {formatDateTime(l.timestamp)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                    {l.entityType}
                  </span>
                  <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                    · {l.userName ?? l.userEmail ?? "—"}
                  </span>
                </div>
              </div>
            ))}
            {data.auditLogs.length > 30 && (
              <p className="text-m-caption text-center pt-1" style={{ color: "var(--color-ink-400)" }}>
                Showing 30 of {data.auditLogs.length}
              </p>
            )}
          </div>
        )}
      </SectionCard>

      {/* Backups */}
      <SectionCard title="Backups">
        {data.backups.length === 0 ? (
          <MobileEmptyState icon={Building2} title="No backups recorded yet" size="compact" />
        ) : (
          <div className="flex flex-col gap-1">
            {data.backups.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-[0.5rem] border p-2"
                style={{ borderColor: "var(--color-line)" }}
              >
                <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  {formatDateTime(b.createdAt)}
                </span>
                <span className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {b.sizeBytes > 0 ? `${(b.sizeBytes / 1024).toFixed(1)} KB` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </CollapsibleSection>
  );
}
