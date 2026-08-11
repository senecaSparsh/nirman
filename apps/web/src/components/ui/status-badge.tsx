import { Badge, type BadgeProps } from "@/components/ui/badge";

/**
 * ═══════════════════════════════════════════════════════════════════
 * STATUS BADGE — maps any status string to the right badge variant.
 *
 * Every status in the system falls into one of six categories (§44.8.1):
 *
 *   Draft / Pending    → muted   (gray)   — DRAFT, SUBMITTED, PENDING
 *   Approved / Active  → info    (blue)   — APPROVED, ACTIVE, ORDERED
 *   In Progress        → warning (amber)  — PARTIAL, COUNTED, SYNCING
 *   Complete / Success → success (green)  — RECEIVED, COMPLETED, SYNCED, PAID
 *   Rejected / Failed  → danger  (red)    — REJECTED, CANCELLED, FAILED, OVERDUE
 *   Sold / Terminal    → brand   (ochre)  — SOLD, PARTITIONED, RETIRED, DELISTED
 *
 * Usage:
 *   <StatusBadge status="APPROVED" />
 *   <StatusBadge status="PARTIAL" label="Partial Receipt" />
 *
 * The `label` prop overrides the display text. Without it, the status
 * string is prettified (PARTIAL → "Partial", SUB_ADMIN_APPROVED →
 * "Sub Admin Approved").
 * ═══════════════════════════════════════════════════════════════════
 */

/** The six status categories from the design spec. */
type StatusCategory = "draft" | "active" | "progress" | "success" | "failed" | "terminal";

/** Maps each known status string to its category. */
const STATUS_CATEGORY: Record<string, StatusCategory> = {
  // ── Draft / Pending (muted gray) ──
  DRAFT: "draft",
  SUBMITTED: "draft",
  PENDING: "draft",
  INQUIRY: "draft",

  // ── Approved / Active (info blue) ──
  APPROVED: "active",
  ACTIVE: "active",
  ORDERED: "active",
  BOOKED: "active",
  LISTED: "active",
  SUB_ADMIN_APPROVED: "active",
  CONFIRMED: "active",

  // ── In Progress (warning amber) ──
  PARTIAL: "progress",
  COUNTED: "progress",
  SYNCING: "progress",
  IN_TRANSIT: "progress",
  UNDER_CONSTRUCTION: "progress",
  INSPECTING: "progress",

  // ── Complete / Success (success green) ──
  RECEIVED: "success",
  COMPLETED: "success",
  SYNCED: "success",
  PAID: "success",
  RECONCILED: "success",
  CONVERTED: "success",
  DELIVERED: "success",
  AVAILABLE: "success",

  // ── Rejected / Failed (danger red) ──
  REJECTED: "failed",
  CANCELLED: "failed",
  FAILED: "failed",
  OVERDUE: "failed",
  SYNC_FAILED: "failed",
  DISPUTED: "failed",

  // ── Sold / Terminal (brand ochre) ──
  SOLD: "terminal",
  PARTITIONED: "terminal",
  RETIRED: "terminal",
  DELISTED: "terminal",
  WAIVED: "terminal",
  ARCHIVED: "terminal",
};

const CATEGORY_VARIANT: Record<StatusCategory, BadgeProps["variant"]> = {
  draft: "muted",
  active: "info",
  progress: "warning",
  success: "success",
  failed: "danger",
  terminal: "brand",
};

/** Prettify a status string: PARTIAL → "Partial", SUB_ADMIN_APPROVED → "Sub Admin Approved" */
function prettify(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function StatusBadge({
  status,
  label,
  className,
  size,
  /**
   * The leading dot is on by default. Tint alone is not a reliable
   * signal — roughly 8% of male users can't separate the amber
   * "progress" chip from the green "success" one — so every status
   * carries a second channel in its own colour.
   */
  dot = true,
}: {
  status: string;
  /** Override the display text. Without this, the status is prettified. */
  label?: string;
  className?: string;
  size?: BadgeProps["size"];
  dot?: boolean;
}) {
  const category = STATUS_CATEGORY[status.toUpperCase()] ?? "draft";
  const variant = CATEGORY_VARIANT[category];
  return (
    <Badge variant={variant} size={size} dot={dot} className={className}>
      {label ?? prettify(status)}
    </Badge>
  );
}
