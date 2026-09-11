import { useId, cloneElement, isValidElement } from "react";
import { Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Standard form field wrapper: label (with optional required marker) + control.
 * Use across all form dialogs for consistent spacing and typography.
 */
export function Field({
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const autoId = useId();
  // Use the child's existing id if it has one, otherwise generate one.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childId = isValidElement(children) ? ((children as any).props?.id ?? autoId) : autoId;
  const child = isValidElement(children)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? cloneElement(children as any, { id: childId })
    : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={childId} className={error ? "text-danger" : undefined}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {child}
      {hint && !error && <p className="text-caption text-muted-foreground">{hint}</p>}
      {error && <p className="text-caption text-danger" role="alert">{error}</p>}
    </div>
  );
}
