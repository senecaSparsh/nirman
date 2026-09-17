"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Pencil,
  Check,
  GripVertical,
  RotateCcw,
  Plus,
  X,
  Link2,
  type LucideIcon,
} from "lucide-react";
import type { Persona } from "@/lib/mobile-nav-v2";
import { useFetch } from "@/lib/use-fetch";
import { ROUTE_BY_PATH, canAccess } from "@/lib/route-manifest";
import { RegisterTabs } from "./register-tabs";

/** A serializable extra action from the server (no icon — resolved from the
 *  route manifest client-side). */
export interface ExtraActionDef {
  key: string;
  href: string;
  label: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   QuickActionsBar — persona-aware, editable, drag-to-reorder quick actions.

   Used by the Inventory, HR, and Accounts mobile home pages. Replaces the
   three near-duplicate `*-interactive.tsx` files' hardcoded action grids
   with one component that:

     1. Follows the persona — each action declares which personas it is
        relevant for; the DEFAULT grid shows only what that role uses.
     2. Is editable — a pencil button flips the grid into edit mode where
        tiles can be:
          • dragged to reorder (dnd-kit, long-press to start on touch)
          • removed (X button on each tile)
          • added (+ Add tile opens a picker of all available actions
            for this tab that aren't currently shown)
        A reset button restores the persona default.
     3. Persists per-user, per-company — the custom selection + order is
        saved to the UserPreference table via PUT /api/me/quick-actions
        and follows the account to any device.

   The saved layout is the user's EXPLICIT selection — it can include
   actions outside the persona default and exclude actions within it.
   When no layout is saved, the persona-filtered default is shown.

   The component is server-fed: the parent Server Component passes the
   full action catalog (so icons/hrefs stay server-defined and tree-
   shakeable) plus the user's persona. The client layer handles tab
   state, edit mode, drag, add/remove, and persistence.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface QuickActionDef {
  /** Stable key used for persistence + dnd — e.g. "indents", "purchase-orders". */
  key: string;
  href: string;
  icon: LucideIcon;
  label: string;
  /** Personas for whom this action is relevant. Omit = relevant to all. */
  personas?: Persona[];
}

export interface QuickActionTab {
  id: string;
  label: string;
  icon: string; // emoji
  actions: QuickActionDef[];
  /** Grid columns for this tab. Default 4. Use 3 for tabs with 6 items
   *  where a 3×2 grid reads better than 4+2. */
  columns?: 3 | 4;
}

interface QuickActionsBarProps {
  /** Which module this bar belongs to — used as the persistence namespace. */
  module: "inventory" | "hr" | "accounts" | "site" | "sales";
  /** The current user's persona — drives default action filtering. */
  persona: Persona;
  /** The full tab + action catalog for this module. */
  tabs: QuickActionTab[];
  /** Saved layouts from the server (key → ordered action keys). Optional;
   *  when omitted the component fetches its state on mount. */
  savedLayouts?: Record<string, string[]>;
  /** Extra permission-filtered routes for this module (from the server).
   *  These are routes the user can access but aren't in the curated catalog.
   *  They appear in the "Add" picker so users can pin any route they have
   *  permission to open. Icons are resolved from the route manifest. */
  extraActions?: ExtraActionDef[];
  /** The caller's permission strings. When provided, catalog actions whose
   *  target route is permission-gated and not in this list are hidden —
   *  a persona is a coarse grouping, and narrow roles inside it (e.g.
   *  SECURITY_GUARD on "field") must not see chips they can't open. */
  permissions?: string[];
  /** Sync tab state to the URL (shareable, back-button friendly). Default
   *  true. Set false when the bar is used on a page that doesn't correspond
   *  to the module (e.g., the persona home dashboard uses the "site" module
   *  catalog but lives at /m/home — URL-syncing would redirect to /m/site). */
  syncUrl?: boolean;
}

export function QuickActionsBar({
  module,
  persona,
  tabs,
  savedLayouts: initialSaved,
  extraActions = [],
  permissions,
  syncUrl = true,
}: QuickActionsBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Tab state (URL-synced when syncUrl is true, local-only otherwise) ──
  const paramTab = searchParams.get("tab");
  const defaultTabId = tabs[0]?.id ?? "";
  const initialTab = syncUrl && tabs.some((t) => t.id === paramTab) ? paramTab! : defaultTabId;
  const [activeTabId, setActiveTabId] = React.useState(initialTab);

  React.useEffect(() => {
    if (!syncUrl) return;
    const t = searchParams.get("tab");
    setActiveTabId(tabs.some((tab) => tab.id === t) ? t! : defaultTabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function selectTab(id: string) {
    setActiveTabId(id);
    if (!syncUrl) return;
    const params = new URLSearchParams(searchParams.toString());
    if (id === defaultTabId) params.delete("tab");
    else params.set("tab", id);
    const qs = params.toString();
    router.replace(qs ? `/m/${module}?${qs}` : `/m/${module}`, { scroll: false });
  }

  // ── Saved layouts (selection + order per tab) ──
  const [savedLayouts, setSavedLayouts] = React.useState<Record<string, string[]>>(
    initialSaved ?? {},
  );
  // Skipped when server already provided layouts; merge on arrival.
  const { data: qaData, loading: loadingLayouts } = useFetch<{ layouts?: Record<string, string[]> }>(
    "/api/me/quick-actions",
    { skip: !!initialSaved },
  );
  React.useEffect(() => {
    if (qaData?.layouts) setSavedLayouts(qaData.layouts);
  }, [qaData]);

  // ── Edit mode ──
  const [editMode, setEditMode] = React.useState(false);
  const [showAddPicker, setShowAddPicker] = React.useState(false);

  // ── Derive the visible actions for the active tab ──
  //    The FULL catalog for this tab (all personas) — used to resolve
  //    saved-layout keys so users can add actions outside their persona.
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]!;
  // Drop dead tiles from the catalog itself: (a) actions whose base path is
  // this module's own hub — that includes `?tab=` deep-links, which only
  // switch a tab that's already on this page — and (b) second tiles that
  // point at an identical href. This removes them from the grid AND the
  // Add picker, and makes stale saved-layout keys unresolvable below.
  const hubPath = `/m/${module}`;
  const allTabActions = React.useMemo(() => {
    const seenHrefs = new Set<string>();
    return activeTab.actions.filter((a) => {
      if (a.href.split("?")[0] === hubPath) return false;
      if (seenHrefs.has(a.href)) return false;
      seenHrefs.add(a.href);
      // Permission gate: drop chips that resolve to a gated route the user
      // can't open (matched on the base path — query variants share the
      // target page's perm).
      if (permissions) {
        const route = ROUTE_BY_PATH.get(a.href.split("?")[0]!);
        if (route && !canAccess(route, permissions)) return false;
      }
      return true;
    });
  }, [activeTab, hubPath, permissions]);
  const allByKey = React.useMemo(
    () => new Map(allTabActions.map((a) => [a.key, a])),
    [allTabActions],
  );

  // ── Extra actions from the server (permission-filtered routes not in
  //    the curated catalog). Icons are resolved from the route manifest.
  //    These are module-level — available in the add picker for any tab. ──
  const extraActionDefs = React.useMemo<QuickActionDef[]>(
    () =>
      extraActions.map((e) => {
        const routeEntry = ROUTE_BY_PATH.get(e.href);
        const icon = routeEntry?.icon ?? Link2;
        return { key: e.key, href: e.href, icon, label: e.label };
      }),
    [extraActions],
  );
  const extraByKey = React.useMemo(
    () => new Map(extraActionDefs.map((a) => [a.key, a])),
    [extraActionDefs],
  );

  // Combined lookup: catalog actions + extra route actions. Used to resolve
  // saved-layout keys that might reference either source.
  const combinedByKey = React.useMemo(
    () => new Map([...allByKey, ...extraByKey]),
    [allByKey, extraByKey],
  );

  // Persona-filtered default (what shows when no custom layout is saved).
  const personaActions = React.useMemo(
    () => allTabActions.filter((a) => !a.personas || a.personas.includes(persona)),
    [allTabActions, persona],
  );

  const layoutKey = `quick-actions:${module}:${activeTabId}`;
  const savedOrder = savedLayouts[layoutKey];

  // The final ordered list shown to the user.
  //   No saved layout → persona default.
  //   Has saved layout → resolve each key against the FULL catalog (so
  //   actions outside the persona can appear) and drop stale keys.
  //   We do NOT auto-append missing catalog actions: the saved layout is
  //   the user's explicit selection, and unselected actions must remain
  //   available in the "Add" picker.
  const orderedActions = React.useMemo(() => {
    const list =
      !savedOrder || savedOrder.length === 0
        ? personaActions
        : (() => {
            const ordered: QuickActionDef[] = [];
            const seen = new Set<string>();
            for (const k of savedOrder) {
              const a = combinedByKey.get(k);
              if (a && !seen.has(k)) { ordered.push(a); seen.add(k); }
            }
            return ordered;
          })();
    // The module's own hub route is a dead tap on this page — drop it
    // whether it came from a saved layout or a pinned route, including
    // `?tab=` deep-links to this page's own tab bar. (Already-saved keys
    // are dropped from the layout on the user's next save.)
    return list.filter((a) => a.href.split("?")[0] !== hubPath);
  }, [personaActions, savedOrder, combinedByKey, hubPath]);

  // ── Local edit buffer (only mutated during edit mode) ──
  const [editActions, setEditActions] = React.useState<QuickActionDef[]>([]);
  React.useEffect(() => {
    // Reset the edit buffer when entering edit mode, or when the
    // underlying ordered actions change while already in edit mode
    // (e.g. switching tabs without exiting edit mode).
    if (editMode) setEditActions(orderedActions);
  }, [editMode, orderedActions]);

  // ── dnd-kit sensors: long-press on touch, click-drag on pointer ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setEditActions((items) => {
      const oldIndex = items.findIndex((i) => i.key === active.id);
      const newIndex = items.findIndex((i) => i.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  function removeAction(key: string) {
    setEditActions((items) => items.filter((i) => i.key !== key));
  }

  function addAction(key: string) {
    const a = combinedByKey.get(key);
    if (!a) return;
    setEditActions((items) =>
      items.some((i) => i.key === key) ? items : [...items, a],
    );
  }

  // Set of action keys currently in the edit buffer (for the add picker
  // to mark as "Added"). The picker shows the FULL catalog + extra route
  // actions so the user can see everything available — already-added
  // actions are shown as disabled "Added" tiles.
  const editActionKeys = React.useMemo(
    () => new Set(editActions.map((a) => a.key)),
    [editActions],
  );

  // ── Save the custom selection + order ──
  const [saving, setSaving] = React.useState(false);
  async function saveOrder() {
    const order = editActions.map((a) => a.key);
    setSaving(true);
    try {
      const res = await fetch("/api/me/quick-actions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, tab: activeTabId, order }),
      });
      if (res.ok) {
        setSavedLayouts((prev) => ({ ...prev, [layoutKey]: order }));
      }
    } catch {
      // non-fatal — the order is still applied locally for this session.
    } finally {
      setSaving(false);
      setEditMode(false);
      setShowAddPicker(false);
    }
  }

  // ── Reset to persona default ──
  async function resetOrder() {
    setSaving(true);
    try {
      // Save the persona-default order (the un-customized sequence) so the
      // server state matches what the user sees. This makes "reset" sticky
      // rather than reverting on refresh.
      const defaultOrder = personaActions.map((a) => a.key);
      const res = await fetch("/api/me/quick-actions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, tab: activeTabId, order: defaultOrder }),
      });
      if (res.ok) {
        setSavedLayouts((prev) => ({ ...prev, [layoutKey]: defaultOrder }));
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  const gridCols = activeTab.columns === 3 ? "grid-cols-3" : "grid-cols-4";

  return (
    // data-tour="quick-actions": the product tour's step 1 spotlights this
    // whole bar (tabs + grid). Keep the attribute on this wrapper.
    <div data-tour="quick-actions">
      {/* ── Toggle tabs — transparent text tabs with sliding underline.
          The Edit/Done button merges into the same row via `trailing`. ── */}
      <RegisterTabs
        tabs={tabs.map((t) => ({ value: t.id, label: t.label }))}
        value={activeTabId}
        onChange={selectTab}
        sticky={false}
        trailing={
          loadingLayouts ? null : (
            <button
              onClick={() => (editMode ? saveOrder() : setEditMode(true))}
              disabled={saving}
              className="flex items-center gap-1 px-0.5 shrink-0 text-m-caption font-semibold press disabled:opacity-40"
              style={{ color: editMode ? "var(--color-go)" : "var(--color-ink-500)" }}
              aria-label={editMode ? "Save quick actions" : "Edit quick actions"}
            >
              {editMode ? (
                <>
                  <Check className="size-3.5" />
                  {saving ? "Saving…" : "Done"}
                </>
              ) : (
                <>
                  <Pencil className="size-3.5" />
                  Edit
                </>
              )}
            </button>
          )
        }
      />

      {/* ── Quick actions grid ── */}
      {editMode ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={editActions.map((a) => a.key)} strategy={rectSortingStrategy}>
            <div className={`grid ${gridCols} gap-1.5 mb-2`}>
              {editActions.map((action) => (
                <SortableTile
                  key={action.key}
                  action={action}
                  onRemove={() => removeAction(action.key)}
                />
              ))}
              {/* ── Add tile ── */}
              <button
                onClick={() => setShowAddPicker(true)}
                className="flex flex-col items-center justify-center gap-1 rounded-[0.625rem] border-2 border-dashed p-2 text-m-body press"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                }}
              >
                <Plus className="size-4" style={{ color: "var(--color-ink-400)" }} />
                <span
                  className="font-semibold text-m-caption text-center leading-tight"
                  style={{ color: "var(--color-ink-400)" }}
                >
                  Add
                </span>
              </button>
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className={`grid ${gridCols} gap-1.5 mb-3`}>
          {orderedActions.map((action) => (
            <QuickActionTile
              key={action.key}
              action={action}
              onLongPress={() => setEditMode(true)}
            />
          ))}
        </div>
      )}

      {/* ── Edit-mode footer: reset ── */}
      {editMode && (
        <div className="flex justify-end mb-3">
          <button
            onClick={resetOrder}
            disabled={saving}
            className="flex items-center gap-1 text-m-caption font-semibold press disabled:opacity-40"
            style={{ color: "var(--color-ink-500)" }}
          >
            <RotateCcw className="size-3.5" />
            Reset to default
          </button>
        </div>
      )}

      {/* ── Add-action picker (bottom sheet) ── */}
      {editMode && showAddPicker && (
        <AddActionPicker
          catalog={allTabActions}
          extraActions={extraActionDefs}
          addedKeys={editActionKeys}
          onAdd={addAction}
          onClose={() => setShowAddPicker(false)}
        />
      )}
    </div>
  );
}

/* ── Read-only tile (default mode) ──
   Long-press (~450ms) enters edit mode instead of navigating.
   A quick tap navigates as normal. Uses a pointer-timer approach that
   works for both touch and mouse — if the pointer is held past the
   threshold, we fire onLongPress and set a flag so the subsequent
   click event is swallowed (no navigation). */
function QuickActionTile({
  action,
  onLongPress,
}: {
  action: QuickActionDef;
  onLongPress: () => void;
}) {
  const Icon = action.icon;
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = React.useRef(false);

  function startPress() {
    longPressedRef.current = false;
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      // Haptic feedback (supported on Android Chrome, no-op elsewhere).
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(30);
      }
      onLongPress();
    }, 450);
  }

  function cancelPress() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  // Swallow the click if a long-press fired, so we don't navigate
  // after entering edit mode.
  function handleClick(e: React.MouseEvent) {
    if (longPressedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressedRef.current = false;
    }
  }

  React.useEffect(() => () => cancelPress(), []);

  return (
    <Link
      href={action.href}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
      className="flex flex-col items-center justify-start gap-1.5 rounded-[0.625rem] border px-1 py-2.5 min-h-[4.25rem] text-m-body press select-none"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <Icon className="size-4 mt-0.5" style={{ color: "var(--color-ink-600)" }} />
      <span
        className="font-semibold text-m-caption text-center leading-tight line-clamp-2"
        style={{ color: "var(--color-ink-950)" }}
      >
        {action.label}
      </span>
    </Link>
  );
}

/* ── Sortable tile (edit mode) — draggable + removable ── */
function SortableTile({
  action,
  onRemove,
}: {
  action: QuickActionDef;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: action.key,
  });
  const Icon = action.icon;

  // Split listeners so the X button doesn't start a drag.
  const dragListeners = {
    ...listeners,
    onPointerDown: (e: React.PointerEvent) => {
      // Stop the X button's pointer down from triggering drag.
      if ((e.target as HTMLElement).closest("[data-remove-btn]")) return;
      (listeners as { onPointerDown?: (e: React.PointerEvent) => void }).onPointerDown?.(e);
    },
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...dragListeners}
      className="flex flex-col items-center gap-1 rounded-[0.625rem] border p-2 min-h-[4.25rem] text-m-body cursor-grab active:cursor-grabbing select-none relative"
      style={{
        borderColor: isDragging ? "var(--color-signal)" : "var(--color-line)",
        backgroundColor: "var(--color-paper)",
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        touchAction: "none", // prevent scroll while dragging
      }}
    >
      {/* ── Remove button (top-right) ── */}
      <button
        data-remove-btn
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute -top-1.5 -right-1.5 size-5 rounded-full flex items-center justify-center press"
        style={{
          backgroundColor: "var(--color-stop)",
          color: "var(--color-paper)",
          border: "2px solid var(--color-paper)",
        }}
        aria-label={`Remove ${action.label}`}
      >
        <X className="size-3" />
      </button>

      <div className="flex items-center gap-0.5 self-stretch justify-between pt-0.5">
        <GripVertical className="size-3" style={{ color: "var(--color-ink-300)" }} />
        <Icon className="size-4" style={{ color: "var(--color-ink-500)" }} />
        <span style={{ width: 12 }} />
      </div>
      <span
        className="font-semibold text-m-caption text-center leading-tight"
        style={{ color: "var(--color-ink-950)" }}
      >
        {action.label}
      </span>
    </div>
  );
}

/* ── Add-action picker (bottom sheet) ──
   Shows ALL available actions for the current tab — both the curated
   catalog and extra permission-filtered routes from the server. Actions
   already in the grid are shown as disabled "Added" tiles. Tapping an
   available action adds it and keeps the sheet open so the user can add
   multiple in one go. */
function AddActionPicker({
  catalog,
  extraActions,
  addedKeys,
  onAdd,
  onClose,
}: {
  catalog: QuickActionDef[];
  extraActions: QuickActionDef[];
  addedKeys: Set<string>;
  onAdd: (key: string) => void;
  onClose: () => void;
}) {
  // Merge catalog + extra actions, deduping by key (catalog wins).
  const allActions = React.useMemo(() => {
    const seen = new Set<string>();
    const merged: QuickActionDef[] = [];
    for (const a of catalog) {
      if (!seen.has(a.key)) { merged.push(a); seen.add(a.key); }
    }
    for (const a of extraActions) {
      if (!seen.has(a.key)) { merged.push(a); seen.add(a.key); }
    }
    return merged;
  }, [catalog, extraActions]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[1rem] border-t overflow-hidden"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
          maxHeight: "70vh",
          overflowY: "auto",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: "var(--color-concrete)" }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <p
            className="text-m-body font-bold"
            style={{ color: "var(--color-ink-950)" }}
          >
            Add quick action
          </p>
          <button
            onClick={onClose}
            className="size-7 rounded-full flex items-center justify-center press"
            style={{ backgroundColor: "var(--color-concrete)" }}
            aria-label="Close"
          >
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        {/* Available actions grid — already-added actions are hidden */}
        {allActions.filter((a) => !addedKeys.has(a.key)).length === 0 ? (
          <p
            className="px-4 py-6 text-center text-m-body"
            style={{ color: "var(--color-ink-400)" }}
          >
            All actions are already added
          </p>
        ) : (
        <div className="px-3 pb-4 grid grid-cols-3 gap-1.5">
          {allActions.filter((a) => !addedKeys.has(a.key)).map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                onClick={() => onAdd(action.key)}
                className="flex flex-col items-center gap-1 rounded-[0.625rem] border p-2.5 press"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-paper)",
                }}
              >
                <Icon className="size-5" style={{ color: "var(--color-ink-500)" }} />
                <span
                  className="font-semibold text-m-caption text-center leading-tight"
                  style={{ color: "var(--color-ink-950)" }}
                >
                  {action.label}
                </span>
                <Plus className="size-3" style={{ color: "var(--color-ink-300)" }} />
              </button>
            );
          })}
        </div>
        )}
      </div>
    </>
  );
}
