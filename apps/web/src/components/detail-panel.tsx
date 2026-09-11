"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

/**
 * DETAIL PANEL — the shared entity detail dialog.
 *
 * Replaces the 23+ detail dialog/panel components that each
 * re-implement: Dialog wrapper + header (title, description, status
 * badge) + action button row + body sections + close.
 *
 * The caller provides the entity's title/description/status, an array
 * of action buttons (with permission gating), and the body content
 * (typically a set of sections or a detail table).
 *
 * Usage:
 *   <DetailPanel
 *     open={!!selected}
 *     onOpenChange={(o) => !o && setSelected(null)}
 *     title={po.poNumber}
 *     description={po.supplierName}
 *     status={po.status}
 *     actions={[
 *       { label: "Approve", onClick: approve, variant: "default" },
 *       { label: "Cancel", onClick: cancel, variant: "outline" },
 *     ]}
 *   >
 *     <DetailSection title="Items"><ItemsTable /></DetailSection>
 *     <DetailSection title Totals"><Totals /></DetailSection>
 *   </DetailPanel>
 */
export function DetailPanel({
  open,
  onOpenChange,
  title,
  description,
  status,
  statusLabel,
  size = "lg",
  actions,
  children,
  className,
  action,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Status string — rendered as a StatusBadge. */
  status?: string;
  /** Override the status badge label. */
  statusLabel?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  /** Action buttons for the header area. */
  actions?: {
    label: string;
    onClick: () => void | Promise<void>;
    variant?: "default" | "outline" | "ghost" | "destructive";
    icon?: React.ReactNode;
    disabled?: boolean;
    loading?: boolean;
    /** Only render if this returns true. */
    show?: boolean;
  }[];
  children: React.ReactNode;
  className?: string;
  /** Optional extra node in the header (e.g. a print button). */
  action?: React.ReactNode;
}) {
  const visibleActions = actions?.filter((a) => a.show !== false) ?? [];
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  async function handleAction(label: string, onClick: () => void | Promise<void>) {
    setBusyAction(label);
    try {
      await onClick();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size={size}
      className={className}
      action={
        <div className="flex items-center gap-2">
          {action}
          {visibleActions.map((a) => (
            <Button
              key={a.label}
              variant={a.variant ?? "outline"}
              size="sm"
              disabled={a.disabled || busyAction === a.label}
              loading={busyAction === a.label}
              onClick={() => handleAction(a.label, a.onClick)}
            >
              {a.icon}
              {a.label}
            </Button>
          ))}
        </div>
      }
    >
      {status && (
        <div className="mb-3">
          <StatusBadge status={status} label={statusLabel} />
        </div>
      )}
      {children}
    </Dialog>
  );
}

/**
 * DETAIL SECTION — a titled section within a DetailPanel.
 * Renders a label header + content with consistent spacing.
 */
export function DetailSection({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn("py-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-label font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * DETAIL GRID — a two-column key/value grid for entity metadata.
 */
export function DetailGrid({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-x-5 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-caption text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 text-body text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
