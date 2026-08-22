"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  ChevronRight,
  HardHat,
  Warehouse,
  Package,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export interface InventoryLocationNode {
  id: string;
  name: string;
  type: string;
  stockValue: number;
  skuCount: number;
}

export interface InventoryProjectNode {
  id: string;
  name: string;
  status: string;
  stockValue: number;
  skuCount: number;
  locations: InventoryLocationNode[];
}

export interface InventoryCompanyNode {
  id: string;
  name: string;
  businessType: string | null;
  isCurrent: boolean;
  warehouseValue: number;
  stockValue: number;
  skuCount: number;
  warehouses: InventoryLocationNode[];
  projects: InventoryProjectNode[];
  subsidiaries: InventoryCompanyNode[];
}

export interface InventoryTreeData {
  rootName: string;
  totalValue: number;
  companyCount: number;
  locationCount: number;
  skuCount: number;
  companies: InventoryCompanyNode[];
}

/* ═══════════════════════════════════════════════════════════════════════════
   INVENTORY HIERARCHY — file-system tree with proper depth

   Each level indented 20px with continuous connector lines.
   Company (depth 0)
   │  ├── Warehouse (depth 1)
   │  ├── Project (depth 1)
   │  │   └── Site (depth 2)
   │  └── Subsidiary (depth 1)
   │      └── ...
   ═══════════════════════════════════════════════════════════════════════════ */

const INDENT_PX = 20; // per-level indent width

/* Count all stock locations under a company (warehouses + project sites + subsidiary locations) */
function countLocations(company: InventoryCompanyNode): number {
  let n = company.warehouses.length;
  for (const p of company.projects) n += p.locations.length;
  for (const s of company.subsidiaries) n += countLocations(s);
  return n;
}

export function InventoryHierarchy({ tree }: { tree: InventoryTreeData }) {
  return (
    <section className="mb-4">
      {/* ── Tree ── */}
      <div
        className="rounded-[0.625rem] border px-1 py-1.5"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        {tree.companies.length === 0 ? (
          <p className="py-4 text-center text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
            No stock locations
          </p>
        ) : (
          <div className="flex flex-col">
            {tree.companies.map((company, i) => (
              <CompanyNode
                key={company.id}
                company={company}
                isLast={i === tree.companies.length - 1}
                depth={0}
                defaultOpen={tree.companies.length === 1 || company.isCurrent}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPANY NODE
   ═══════════════════════════════════════════════════════════════════════════ */
function CompanyNode({
  company,
  isLast,
  depth,
  defaultOpen,
}: {
  company: InventoryCompanyNode;
  isLast: boolean;
  depth: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const childCount = company.warehouses.length + company.projects.length + company.subsidiaries.length;
  const locCount = countLocations(company);

  return (
    <div>
      <TreeRow
        depth={depth}
        isLast={isLast}
        icon={<Building2 className="size-2.5" style={{ color: "#fff" }} />}
        iconBg="var(--color-ink-950)"
        chevron={childCount > 0}
        chevronOpen={open}
        onChevronClick={() => setOpen((o) => !o)}
        name={company.name}
        nameHref="/m/stock"
        nameBold
        badge={company.isCurrent ? "You" : undefined}
        sub={`${locCount} loc · ${company.skuCount} SKU`}
        value={company.stockValue}
        paddingTop={depth === 0 ? 0.5 : 0}
      />

      {open && childCount > 0 ? (
        <div>
          {company.warehouses.map((loc, i) => (
            <LeafNode
              key={loc.id}
              icon={<Warehouse className="size-2.5" style={{ color: "var(--color-signal-dark)" }} />}
              iconBg="var(--color-signal-wash)"
              name={loc.name}
              sub={`${loc.skuCount} SKU`}
              value={loc.stockValue}
              href={`/m/stock?locationId=${loc.id}`}
              isLast={i === company.warehouses.length - 1 && company.projects.length === 0 && company.subsidiaries.length === 0}
              depth={depth + 1}
            />
          ))}
          {company.projects.map((project, i) => (
            <ProjectNode
              key={project.id}
              project={project}
              isLast={i === company.projects.length - 1 && company.subsidiaries.length === 0}
              depth={depth + 1}
            />
          ))}
          {company.subsidiaries.map((sub, i) => (
            <CompanyNode
              key={sub.id}
              company={sub}
              isLast={i === company.subsidiaries.length - 1}
              depth={depth + 1}
              defaultOpen={sub.isCurrent}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROJECT NODE
   ═══════════════════════════════════════════════════════════════════════════ */
function ProjectNode({
  project,
  isLast,
  depth,
}: {
  project: InventoryProjectNode;
  isLast: boolean;
  depth: number;
}) {
  const multiSite = project.locations.length > 1;
  const [open, setOpen] = React.useState(false);
  const directHref = project.locations[0]
    ? `/m/stock?locationId=${project.locations[0].id}`
    : `/m/projects/${project.id}`;

  return (
    <div>
      <TreeRow
        depth={depth}
        isLast={isLast}
        icon={<HardHat className="size-2.5" style={{ color: "var(--color-ink-700)" }} />}
        iconBg="var(--color-concrete)"
        chevron={multiSite}
        chevronOpen={open}
        onChevronClick={() => setOpen((o) => !o)}
        name={project.name}
        nameHref={multiSite ? undefined : directHref}
        nameOnClick={multiSite ? () => setOpen((o) => !o) : undefined}
        sub={project.status.replace(/_/g, " ").toLowerCase()}
        value={project.stockValue}
      />

      {open && multiSite ? (
        <div>
          {project.locations.map((loc, i) => (
            <LeafNode
              key={loc.id}
              icon={<Package className="size-2.5" style={{ color: "var(--color-ink-500)" }} />}
              iconBg="var(--color-paper-2)"
              name={loc.name}
              sub={`${loc.skuCount} SKU`}
              value={loc.stockValue}
              href={`/m/stock?locationId=${loc.id}`}
              isLast={i === project.locations.length - 1}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LEAF NODE
   ═══════════════════════════════════════════════════════════════════════════ */
function LeafNode({
  icon,
  iconBg,
  name,
  sub,
  value,
  href,
  isLast,
  depth,
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  sub: string;
  value: number;
  href: string;
  isLast: boolean;
  depth: number;
}) {
  return (
    <TreeRow
      depth={depth}
      isLast={isLast}
      icon={icon}
      iconBg={iconBg}
      chevron={false}
      name={name}
      nameHref={href}
      sub={sub}
      value={value}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TREE ROW — the shared row primitive

   Handles:
   - Connector lines for all ancestor depths (continuous verticals)
   - Elbow connector for this row's position (├ or └)
   - Optional chevron for collapsible nodes
   - Icon, name (link), sub-label, value
   ═══════════════════════════════════════════════════════════════════════════ */
function TreeRow({
  depth,
  isLast,
  icon,
  iconBg,
  chevron,
  chevronOpen,
  onChevronClick,
  name,
  nameHref,
  nameOnClick,
  nameBold,
  badge,
  sub,
  value,
  paddingTop,
}: {
  depth: number;
  isLast: boolean;
  icon: React.ReactNode;
  iconBg: string;
  chevron?: boolean;
  chevronOpen?: boolean;
  onChevronClick?: () => void;
  name: string;
  nameHref?: string;
  nameOnClick?: () => void;
  nameBold?: boolean;
  badge?: string;
  sub?: string;
  value: number;
  paddingTop?: number;
}) {
  const rowH = 24; // fixed row height in px — ensures connector lines align

  return (
    <div className="flex items-center" style={{ height: rowH, paddingTop: paddingTop ? 2 : 0 }}>
      {/* ── Connector columns for each ancestor depth ── */}
      {Array.from({ length: depth }, (_, i) => {
        const isElbowLevel = i === depth - 1;
        const isAncestorLast = isElbowLevel ? isLast : true; // simplification: ancestors are never last relative to this branch
        return (
          <div
            key={i}
            className="relative shrink-0"
            style={{ width: INDENT_PX, height: rowH }}
          >
            {isElbowLevel ? (
              <>
                {/* Vertical line — top half only if last child, full if not */}
                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    top: 0,
                    width: 1,
                    height: isLast ? rowH / 2 : rowH,
                    backgroundColor: "var(--color-line)",
                  }}
                />
                {/* Horizontal elbow */}
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{
                    left: "50%",
                    width: INDENT_PX / 2,
                    height: 1,
                    backgroundColor: "var(--color-line)",
                  }}
                />
              </>
            ) : (
              /* Ancestor: full vertical line (continuous through siblings) */
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  top: 0,
                  bottom: 0,
                  width: 1,
                  backgroundColor: "var(--color-line)",
                }}
              />
            )}
          </div>
        );
      })}

      {/* ── Chevron (or spacer) ── */}
      <div className="shrink-0 w-4 flex items-center justify-center">
        {chevron ? (
          <button type="button" onClick={onChevronClick} className="press">
            <ChevronRight
              className="size-3 transition-transform"
              style={{
                color: "var(--color-ink-500)",
                transform: chevronOpen ? "rotate(90deg)" : "none",
              }}
            />
          </button>
        ) : null}
      </div>

      {/* ── Icon ── */}
      <span
        className="grid place-items-center size-4 rounded-[0.1875rem] shrink-0"
        style={{ backgroundColor: iconBg }}
      >
        {icon}
      </span>

      {/* ── Name + badge ── */}
      {nameHref ? (
        <Link
          href={nameHref}
          onClick={nameOnClick}
          className={`min-w-0 flex-1 truncate press ml-1.5 ${nameBold ? "text-[0.6875rem] font-bold" : "text-[0.625rem] font-semibold"}`}
          style={{ color: "var(--color-ink-950)" }}
        >
          {name}
          {badge ? (
            <span
              className="ml-1 inline-block rounded px-1 py-px text-[0.375rem] font-bold uppercase align-middle"
              style={{ backgroundColor: "var(--color-signal-wash)", color: "var(--color-signal-dark)" }}
            >
              {badge}
            </span>
          ) : null}
        </Link>
      ) : (
        <button
          type="button"
          onClick={nameOnClick}
          className={`min-w-0 flex-1 truncate text-left press ml-1.5 ${nameBold ? "text-[0.6875rem] font-bold" : "text-[0.625rem] font-semibold"}`}
          style={{ color: "var(--color-ink-950)" }}
        >
          {name}
          {badge ? (
            <span
              className="ml-1 inline-block rounded px-1 py-px text-[0.375rem] font-bold uppercase align-middle"
              style={{ backgroundColor: "var(--color-signal-wash)", color: "var(--color-signal-dark)" }}
            >
              {badge}
            </span>
          ) : null}
        </button>
      )}

      {/* ── Sub-label ── */}
      {sub ? (
        <span className="text-[0.4375rem] shrink-0 ml-1" style={{ color: "var(--color-ink-400)" }}>
          {sub}
        </span>
      ) : null}

      {/* ── Value ── */}
      <p className="numeric text-[0.5625rem] font-bold shrink-0 ml-2" style={{ color: "var(--color-ink-950)" }}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}
