"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, CornerDownLeft, Package, Truck,
  LandPlot, ShoppingCart, Wallet,
  ScrollText, ScanLine, BookOpen, CheckSquare, ClipboardList, ClipboardCheck,
  TrendingUp, CalendarCheck, HardHat, Recycle, Globe, Zap, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { linksFor, settingsLinksFor, WORLD_BY_KEY, type NavLink, type WorldKey } from "@/lib/nav";

type PageLink = NavLink & { world: WorldKey };

/**
 * Command Palette (⌘K / Ctrl+K) — the primary navigation innovation.
 *
 * Not just a page jumper — an operational search engine. Three result types:
 *
 * 1. **Pages** — fuzzy-matched nav items. Type "proc" → Procurement page.
 * 2. **Actions** — intent-based shortcuts. Type "receive" → jump to the field
 *    receiving page. Type "partition" → jump to the land partition canvas.
 *    These encode *what you want to do*, not *which module it's in*.
 * 3. **Entities** — live search via API. Type "OPC" → the cement material.
 *    Type "Tower A" → the project. Type "PO-2024" → the purchase order.
 *    Debounced, cancels on new input, shows loading state.
 *
 * Keyboard: ↑/↓ to navigate, Enter to select, Esc to close, ⌘K to toggle.
 */

// ── Action shortcuts ────────────────────────────────────────────

interface ActionItem {
  label: string;
  hint: string;
  icon: LucideIcon;
  href: string;
  keywords: string[];
}

const ACTIONS: ActionItem[] = [
  { label: "Receive goods", hint: "Field receiving", icon: ScanLine, href: "/field", keywords: ["receive", "goods receipt", "delivery", "shipment", "field"] },
  { label: "Create requisition", hint: "Request materials", icon: ClipboardList, href: "/requisitions", keywords: ["requisition", "request", "indent"] },
  { label: "Create purchase order", hint: "Procurement", icon: Truck, href: "/procurement", keywords: ["purchase", "order", "po", "procure", "buy"] },
  { label: "Issue materials to project", hint: "Stock consumption", icon: Package, href: "/stock?tab=issues", keywords: ["issue", "consume", "material issue", "dispatch"] },
  { label: "Partition land parcel", hint: "CAD canvas", icon: LandPlot, href: "/land", keywords: ["partition", "split", "subdivide", "plot", "land", "canvas"] },
  { label: "Sell unit or plot", hint: "Asset sale", icon: ShoppingCart, href: "/sales", keywords: ["sell", "sale", "customer", "booking", "unit", "plot"] },
  { label: "Record expense", hint: "Operating expense", icon: Wallet, href: "/finance", keywords: ["expense", "spend", "operating"] },
  { label: "Add project cost", hint: "Capitalise into WIP", icon: TrendingUp, href: "/finance", keywords: ["project cost", "wip", "capitalise", "labour"] },
  { label: "View trial balance", hint: "General Ledger", icon: BookOpen, href: "/gl", keywords: ["trial balance", "ledger", "gl", "books", "accounting", "gst"] },
  { label: "Transfer stock", hint: "Between locations", icon: ScrollText, href: "/stock?tab=transfers", keywords: ["transfer", "move", "stock transfer", "sto"] },
  { label: "View approvals queue", hint: "Pending approvals", icon: ClipboardCheck, href: "/approvals", keywords: ["approve", "approval", "pending", "queue"] },
  { label: "View my tasks", hint: "Task manager", icon: CheckSquare, href: "/my-tasks", keywords: ["task", "my tasks", "todo", "assigned"] },
  { label: "Mark attendance", hint: "Daily haziri", icon: CalendarCheck, href: "/hr/attendance", keywords: ["attendance", "haziri", "present", "absent", "check in", "muster"] },
  { label: "Submit DPR", hint: "Daily progress report", icon: ClipboardList, href: "/hr/dprs", keywords: ["dpr", "daily progress", "daily report", "site report", "work done", "progress"] },
  { label: "Sell scrap or surplus", hint: "Material sale with cost recovery", icon: Recycle, href: "/material-sales", keywords: ["scrap", "surplus", "material sale", "cost recovery", "by-product", "resale"] },
  { label: "List unit on portal", hint: "99acres / MagicBricks sync", icon: Globe, href: "/portal-listings", keywords: ["portal", "listing", "99acres", "magicbricks", "housing", "marketplace", "property portal"] },
  { label: "Generate auto-requisition", hint: "Reorder low-stock materials", icon: Zap, href: "/requisitions?auto=1", keywords: ["auto requisition", "reorder", "low stock", "eoq", "automatic", "generate requisition"] },
  { label: "Run payroll", hint: "Attendance to salary", icon: HardHat, href: "/hr/payroll", keywords: ["payroll", "salary", "wage", "pay", "tankha", "run"] },
];

// ── Entity search ───────────────────────────────────────────────

interface EntityResult {
  id: string;
  label: string;
  sublabel: string;
  type: string;
  href: string;
}

const ENTITY_SEARCHES: { type: string; endpoint: string; label: string; href: (id: string) => string; extract: (d: unknown) => EntityResult[] }[] = [
  {
    type: "material",
    endpoint: "/api/materials?q=",
    label: "Materials",
    href: (id) => `/materials/${id}`,
    extract: (data) =>
      (Array.isArray(data) ? data : []).slice(0, 4).map((m: Record<string, unknown>) => ({
        id: String(m.id),
        label: String(m.name ?? ""),
        sublabel: `${m.code ?? ""} · ${m.unit ?? ""}`,
        type: "Material",
        href: `/materials/${m.id}`,
      })),
  },
  {
    type: "project",
    endpoint: "/api/projects?q=",
    label: "Projects",
    href: (id) => `/projects/${id}`,
    extract: (data) =>
      (Array.isArray(data) ? data : []).slice(0, 4).map((p: Record<string, unknown>) => ({
        id: String(p.id),
        label: String(p.name ?? ""),
        sublabel: String(p.type ?? "Project"),
        type: "Project",
        href: `/projects/${p.id}`,
      })),
  },
  {
    type: "supplier",
    endpoint: "/api/suppliers?q=",
    label: "Suppliers",
    href: (id) => `/suppliers/${id}`,
    extract: (data) =>
      (Array.isArray(data) ? data : []).slice(0, 4).map((s: Record<string, unknown>) => ({
        id: String(s.id),
        label: String(s.name ?? ""),
        sublabel: `${s.gstin ?? "No GSTIN"} · ${s.phone ?? "No phone"}`,
        type: "Supplier",
        href: `/suppliers/${s.id}`,
      })),
  },
  {
    type: "po",
    endpoint: "/api/purchase-orders?q=",
    label: "Purchase Orders",
    href: (id) => `/procurement/${id}`,
    extract: (data) =>
      (Array.isArray(data) ? data : []).slice(0, 4).map((p: Record<string, unknown>) => ({
        id: String(p.id),
        label: String(p.poNumber ?? ""),
        sublabel: `${p.supplierName ?? "Supplier"} · ${p.status}`,
        type: "Purchase Order",
        href: `/procurement/${p.id}`,
      })),
  },
];

// ── Fuzzy search ────────────────────────────────────────────────

function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.startsWith(q)) return 100 - t.length;
  if (t.includes(q)) return 50 - (t.indexOf(q) + t.length);
  // Subsequence match
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length ? 10 - (t.length - q.length) : -1;
}

/**
 * Pages are searched by label, by world, by their plain-language hint,
 * and by domain synonyms declared in nav.ts (`keywords`). That means
 * "haziri" finds Attendance and "indent" finds Requisitions — people
 * search with the words they actually use, not our menu labels.
 *
 * Settings links are included too — "users", "workflows", "company"
 * all find their settings pages even though settings isn't a world.
 */
function searchNavItems(query: string, role: string): { item: PageLink; score: number }[] {
  const worldLinks = linksFor(role).map((item) => {
    const world = WORLD_BY_KEY[item.world].label;
    const score = Math.max(
      fuzzyScore(query, item.label),
      fuzzyScore(query, world) / 2,
      fuzzyScore(query, item.hint) / 3,
      ...(item.keywords ?? []).map((k) => fuzzyScore(query, k)),
    );
    return { item, score };
  });

  // Settings links — tagged with a synthetic "today" world so they render.
  const settingsLinks = settingsLinksFor(role).map((item) => {
    const score = Math.max(
      fuzzyScore(query, item.label),
      fuzzyScore(query, "Settings") / 2,
      fuzzyScore(query, item.hint) / 3,
      ...(item.keywords ?? []).map((k) => fuzzyScore(query, k)),
    );
    return { item: { ...item, world: "today" as WorldKey }, score };
  });

  return [...worldLinks, ...settingsLinks]
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score);
}

function searchActions(query: string): { action: ActionItem; score: number }[] {
  return ACTIONS.map((action) => {
    const labelScore = fuzzyScore(query, action.label);
    const keywordScore = Math.max(...action.keywords.map((k) => fuzzyScore(query, k)));
    const score = Math.max(labelScore, keywordScore);
    return { action, score };
  })
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score);
}

// ── Component ───────────────────────────────────────────────────

export function CommandPalette({ userRole = "MANAGER" }: { userRole?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [entities, setEntities] = useState<EntityResult[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // ── Keyboard shortcut: ⌘K / Ctrl+K ────────────────────────────
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setEntities([]);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // ── Debounced entity search ───────────────────────────────────
  useEffect(() => {
    if (!query || query.length < 2) {
      setEntities([]);
      setEntityLoading(false);
      return;
    }
    setEntityLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await Promise.all(
          ENTITY_SEARCHES.map(async (search) => {
            try {
              const res = await fetch(`${search.endpoint}${encodeURIComponent(query)}`);
              if (!res.ok) return [];
              const data = await res.json();
              return search.extract(data);
            } catch {
              return [];
            }
          }),
        );
        setEntities(results.flat().slice(0, 6));
      } finally {
        setEntityLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // ── Build results list ────────────────────────────────────────
  const results = useMemo(() => {
    type Result =
      | { kind: "page"; item: PageLink }
      | { kind: "action"; action: ActionItem }
      | { kind: "entity"; entity: EntityResult };

    const all: Result[] = [];

    if (!query) {
      // No query — lead with things to *do*, then places to go.
      ACTIONS.slice(0, 6).forEach((action) => all.push({ kind: "action", action }));
      linksFor(userRole)
        .slice(0, 6)
        .forEach((item) => all.push({ kind: "page", item }));
      return all;
    }

    // Pages
    const pages = searchNavItems(query, userRole).slice(0, 4);
    pages.forEach((r) => all.push({ kind: "page", item: r.item }));

    // Actions
    const actions = searchActions(query).slice(0, 4);
    actions.forEach((r) => all.push({ kind: "action", action: r.action }));

    // Entities (from API)
    entities.forEach((entity) => all.push({ kind: "entity", entity }));

    return all;
  }, [query, entities, userRole]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  // ── Keyboard navigation ───────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = results[selectedIndex];
      if (result) selectResult(result);
    }
  }

  function selectResult(result: (typeof results)[number]) {
    if (result.kind === "page") router.push(result.item.href);
    else if (result.kind === "action") router.push(result.action.href);
    else if (result.kind === "entity") router.push(result.entity.href);
    setOpen(false);
  }

  // Scroll selected item into view
  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    const selected = container.children[selectedIndex] as HTMLElement;
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or jump to…"
            className="flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-micro text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div ref={resultsRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 && !entityLoading && (
            <div className="py-8 text-center text-body text-muted-foreground">
              No results for &quot;{query}&quot;
            </div>
          )}

          {results.map((result, idx) => {
            const isSelected = idx === selectedIndex;
            const icon =
              result.kind === "page" ? result.item.icon :
              result.kind === "action" ? result.action.icon :
              Search;
            const label =
              result.kind === "page" ? result.item.label :
              result.kind === "action" ? result.action.label :
              result.entity.label;
            const sublabel =
              result.kind === "page" ? result.item.hint :
              result.kind === "action" ? result.action.hint :
              result.entity.sublabel;
            const tag =
              result.kind === "page" ? WORLD_BY_KEY[result.item.world].label :
              result.kind === "action" ? "Action" :
              result.entity.type;

            return (
              <button
                key={idx}
                onClick={() => selectResult(result)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                  isSelected ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                <span className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  isSelected ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                )}>
                  {icon && (() => { const Icon = icon; return <Icon className="h-3.5 w-3.5" />; })()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-medium text-foreground">{label}</div>
                  <div className="truncate text-caption text-muted-foreground">{sublabel}</div>
                </div>
                <span className="shrink-0 text-micro text-muted-foreground/60">{tag}</span>
                {isSelected && <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" />}
              </button>
            );
          })}

          {entityLoading && (
            <div className="py-3 text-center text-caption text-muted-foreground">Searching…</div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-micro text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5">↑</kbd>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5">↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5">↵</kbd>
              to select
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
