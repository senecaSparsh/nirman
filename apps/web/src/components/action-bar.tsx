"use client";

import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ACTION BAR — a row of permission-gated action buttons.
 *
 * Replaces the ~30 inline action button rows in detail dialogs and
 * list views. Each action can be gated by a boolean (permission check)
 * and carries its own variant + icon + loading state.
 *
 * Usage:
 *   <ActionBar
 *     actions={[
 *       { label: "Approve", onClick: approve, variant: "default", show: canApprove },
 *       { label: "Edit", onClick: edit, variant: "outline", show: canManage },
 *       { label: "Delete", onClick: del, variant: "destructive", show: canManage },
 *     ]}
 *   />
 */
export function ActionBar({
  actions,
  className,
  align = "end",
}: {
  actions: {
    label: string;
    onClick: () => void | Promise<void>;
    variant?: ButtonProps["variant"];
    size?: ButtonProps["size"];
    icon?: React.ReactNode;
    disabled?: boolean;
    loading?: boolean;
    /** Only render if this returns true. Omit to always show. */
    show?: boolean;
    /** Render as a link instead of a button (e.g. for "View" actions). */
    href?: string;
  }[];
  className?: string;
  align?: "start" | "end" | "center";
}) {
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const visible = actions.filter((a) => a.show !== false);
  if (visible.length === 0) return null;

  async function handleClick(label: string, onClick: () => void | Promise<void>) {
    setBusyAction(label);
    try {
      await onClick();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        align === "end" && "justify-end",
        align === "center" && "justify-center",
        className,
      )}
    >
      {visible.map((a) => (
        <Button
          key={a.label}
          variant={a.variant ?? "outline"}
          size={a.size ?? "sm"}
          asChild={!!a.href}
          disabled={a.disabled || busyAction === a.label}
          loading={busyAction === a.label}
          onClick={a.href ? undefined : () => handleClick(a.label, a.onClick)}
        >
          {a.href ? <a href={a.href}>{a.icon}{a.label}</a> : <>{a.icon}{a.label}</>}
        </Button>
      ))}
    </div>
  );
}
