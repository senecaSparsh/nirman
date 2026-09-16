"use client";

import * as React from "react";
import Link from "next/link";
import {
  Boxes, Users, BookOpen, Truck,
  ShoppingCart, FileText, Package,
  ArrowRight, ShieldAlert, GitBranch, ListTree,
  Wrench, Wallet, ClipboardCheck,
  type LucideIcon} from "lucide-react";
import type { Persona } from "@/lib/mobile-nav-v2";
import { PersonaSignature } from "@/components/mobile/v2/persona-signature";
import { PERM } from "@/lib/roles";

/* ═══════════════════════════════════════════════════════════════════════════
   PERSONA HOME DASHBOARD

   Shown on /m/home for non-executive personas. The executive renders the
   OrbitNavigator instead.

   Structure — three layers, none of which repeat each other:

     1. HomeTree (rendered above this, in adaptive-home)
          the briefing: approvals, low stock, deliveries, payments, recent
     2. PersonaSignature
          the role's signature component — a Shift Rail for field, a
          Project Pulse for ops, and so on. This is the per-role analogue
          of the executive's orbit.
     3. Cross-module links
          destinations OUTSIDE this role's primary module. These are the
          only navigation here, because everything inside the primary
          module already has a bottom-tab.

   WHAT IS DELIBERATELY ABSENT: the QuickActionsBar. It used to render
   here with the exact same catalog the role's department tab renders
   (SITE_QUICK_ACTIONS on both /m/home and /m/site for ops and field,
   HR_QUICK_ACTIONS on both for hr, and so on) — the identical grid, twice,
   one tab apart. The department hub is the right owner for it: that page
   exists to launch work in a module. Home now answers "how are things?",
   the department tab answers "what do I do?". Do not re-add it here.
   ═══════════════════════════════════════════════════════════════════════════ */

interface PersonaHomeDashboardProps {
  persona: Persona;
  role: string;
  /** Effective permission union — gates cross-module links. */
  perms: string[];
  currentCompany: { id: string; name: string; businessType: string | null; currency: string };
}

/**
 * Cross-module links per persona — destinations this role needs that are
 * NOT reachable from their own module's tab. Anything inside the primary
 * module is intentionally excluded: it already has a tab, and repeating
 * it here is the same duplication the quick-action grid was guilty of.
 */
const PERSONA_LINKS: Record<Persona, { label: string; href: string; icon: LucideIcon; perm?: string }[]> = {
  executive: [],

  // A PM lives in /m/site; these are the governance surfaces around it.
  ops: [
    { label: "Approvals", href: "/m/approvals", icon: ClipboardCheck },
    { label: "Change Orders", href: "/m/change-orders", icon: GitBranch, perm: PERM.PROJECTS_VIEW },
    { label: "WBS", href: "/m/wbs", icon: ListTree, perm: PERM.WBS_VIEW },
    { label: "Quality Control", href: "/m/quality-control", icon: ShieldAlert, perm: PERM.QC_VIEW },
  ],

  // Procurement lives in /m/inventory; these are the supply-side records.
  procurement: [
    { label: "Suppliers", href: "/m/suppliers", icon: Truck, perm: PERM.PROCUREMENT_VIEW },
    { label: "Rate Contracts", href: "/m/rate-contracts", icon: FileText, perm: PERM.PROCUREMENT_VIEW },
    { label: "Gate Pass", href: "/m/gate-pass", icon: Package, perm: PERM.GATE_PASS_VIEW },
    { label: "Equipment", href: "/m/equipment", icon: Wrench, perm: PERM.ASSETS_VIEW },
  ],

  // Field lives in /m/site; these are the off-site errands.
  field: [
    { label: "Gate Pass", href: "/m/gate-pass", icon: Package, perm: PERM.GATE_PASS_VIEW },
    { label: "HR / Leaves", href: "/m/hr/leaves", icon: Users, perm: PERM.HR_VIEW },
    { label: "Procurement", href: "/m/procurement", icon: ShoppingCart, perm: PERM.PROCUREMENT_VIEW },
    // Field staff file reimbursement claims — company expense booking
    // (/m/expenses) needs finance.view and isn't their surface.
    { label: "Expenses", href: "/m/expense-claims", icon: Wallet, perm: PERM.CLAIM_CREATE },
  ],

  // Sales lives in /m/sales; these are the supporting functions.
  sales: [
    { label: "Inventory", href: "/m/inventory", icon: Boxes, perm: PERM.INVENTORY_VIEW },
    { label: "Accounts", href: "/m/accounts", icon: BookOpen, perm: PERM.FINANCE_VIEW },
    { label: "Procurement", href: "/m/procurement", icon: ShoppingCart, perm: PERM.PROCUREMENT_VIEW },
    { label: "HR", href: "/m/hr", icon: Users, perm: PERM.HR_VIEW },
  ],

  // Finance lives in /m/accounts; these are the sources of its numbers.
  finance: [
    { label: "Procurement", href: "/m/procurement", icon: ShoppingCart, perm: PERM.PROCUREMENT_VIEW },
    { label: "Suppliers", href: "/m/suppliers", icon: Truck, perm: PERM.PROCUREMENT_VIEW },
    { label: "Projects", href: "/m/projects", icon: Boxes, perm: PERM.PROJECTS_VIEW },
    { label: "HR", href: "/m/hr", icon: Users, perm: PERM.HR_VIEW },
  ],

  // HR lives in /m/hr; these are the places its people show up.
  hr: [
    { label: "Departments", href: "/m/departments", icon: Boxes, perm: PERM.COMPANY_MANAGE },
    { label: "Quality Control", href: "/m/quality-control", icon: ShieldAlert, perm: PERM.QC_VIEW },
    { label: "Equipment", href: "/m/equipment", icon: Wrench, perm: PERM.ASSETS_VIEW },
    { label: "Accounts", href: "/m/accounts", icon: BookOpen, perm: PERM.FINANCE_VIEW },
  ]};

export function PersonaHomeDashboard({
  persona,
  role: _role,
  perms,
  currentCompany: _currentCompany}: PersonaHomeDashboardProps) {
  // Filter by the user's effective permission union — a persona is a coarse
  // grouping, and narrow roles inside it (e.g. SECURITY_GUARD on "field")
  // must not see links they can't open. The union includes live delegation
  // grants so delegates see the surface they can act on.
  const links = (PERSONA_LINKS[persona] ?? []).filter(
    (l) => !l.perm || perms.includes(l.perm),
  );

  return (
    <div className="space-y-3">
      {/* ── The role's signature component ── */}
      <PersonaSignature persona={persona} />

      {/* ── Cross-module links ── */}
      {links.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {links.map((link) => {
            const LinkIcon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="press flex items-center justify-between rounded-[0.5rem] border p-2.5"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0"
                    style={{ backgroundColor: "var(--color-concrete)" }}
                  >
                    <LinkIcon className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
                  </div>
                  <span className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {link.label}
                  </span>
                </div>
                <ArrowRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
