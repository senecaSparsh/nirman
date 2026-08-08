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
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className={error ? "text-danger" : undefined}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-caption text-muted-foreground">{hint}</p>}
      {error && <p className="text-caption text-danger" role="alert">{error}</p>}
    </div>
  );
}
