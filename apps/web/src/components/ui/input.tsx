import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * FIELDS
 *
 * Every field is 44px on a phone and 32px from `sm` up. The same form
 * has to be fillable on a desk with a mouse and at a site gate with
 * gloves on, so the touch minimum isn't a mobile-only variant — it's
 * the base, and the desktop size is the override.
 *
 * The focus treatment is a brand-coloured border plus a 3px soft ring.
 * A ring alone (v1) leaves the field's own edge unchanged, so on a
 * dense form it's genuinely hard to tell which of eight identical boxes
 * has the caret.
 */
const fieldBase = [
  "w-full rounded-md border border-input bg-card text-foreground",
  "transition-[border-color,box-shadow] duration-100",
  "placeholder:text-faint",
  "hover:border-border-strong",
  "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
  "disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20",
];

const fieldSize = "h-11 px-3 text-[14px] sm:h-8 sm:px-2.5 sm:text-[13px]";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        fieldBase,
        fieldSize,
        // Number inputs get tabular mono: a quantity field should look
        // like the column it will end up in.
        (type === "number" || type === "date" || type === "time") && "tnum",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

/**
 * A native select with the platform arrow suppressed and our own
 * chevron drawn in, so it matches the Input's metrics exactly. Native
 * is deliberate: the OS picker is the fastest control on a phone and
 * the only one that works with a screen reader out of the box.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative w-full">
    <select
      ref={ref}
      className={cn(
        fieldBase,
        "h-11 appearance-none bg-none pl-3 pr-8 text-[14px] sm:h-8 sm:pl-2.5 sm:pr-7 sm:text-[13px]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
  </div>
));
Select.displayName = "Select";

/** An input with a leading icon — search boxes, currency fields. */
export const InputWithIcon = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode }
>(({ className, icon, ...props }, ref) => (
  <div className="relative w-full">
    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint [&_svg]:size-3.5">
      {icon}
    </span>
    <input
      ref={ref}
      className={cn(fieldBase, "h-11 pl-8 pr-3 text-[14px] sm:h-8 sm:pl-7 sm:pr-2.5 sm:text-[13px]", className)}
      {...props}
    />
  </div>
));
InputWithIcon.displayName = "InputWithIcon";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean; hint?: string }
>(({ className, required, hint, children, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("mb-1.5 flex items-baseline gap-1.5 text-meta font-medium text-foreground", className)}
    {...props}
  >
    <span>
      {children}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </span>
    {hint && <span className="text-caption font-normal text-muted-foreground">{hint}</span>}
  </label>
));
Label.displayName = "Label";

/**
 * FIELD — label + control + message as one unit.
 *
 * Validation messages render below the control, reserving no space when
 * absent. Errors are inline and human-readable; there are no modal
 * error popups anywhere in this app.
 */
export function Field({
  label,
  required,
  hint,
  error,
  help,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  help?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required} hint={hint}>
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-caption font-medium text-danger">{error}</p>
      ) : help ? (
        <p className="mt-1 text-caption text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

/**
 * A two-column form grid that collapses to one column on a phone. 2
 * columns is the widest a label/field pair can get before the eye
 * loses the row it's on.
 */
export function FormGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-x-5 gap-y-4 sm:grid-cols-2", className)} {...props} />;
}

/** A labelled group of related fields inside a long form. */
export function Fieldset({
  legend,
  description,
  children,
  className,
}: {
  legend: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-0.5 text-label text-muted-foreground">{legend}</legend>
      {description && <p className="mb-3 text-caption text-muted-foreground">{description}</p>}
      <div className={cn(!description && "mt-3")}>{children}</div>
    </fieldset>
  );
}

export { Textarea } from "./textarea";
