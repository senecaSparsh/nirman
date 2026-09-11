import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * MONEY INPUT — a numeric input with currency symbol prefix and
 * tabular-nums formatting. Replaces the 53+ inline
 * `<Input type="number" />` + `formatCurrency` display patterns.
 *
 * The currency symbol is a non-interactive prefix inside the input's
 * border, so the number field aligns with the table column it will end
 * up in. The input itself is type="text" with inputMode="decimal" to
 * avoid the browser's number spinner (which is ugly and fires onChange
 * on scroll) while still showing the numeric keyboard on mobile.
 *
 * Usage:
 *   <MoneyInput value={amount} onChange={setAmount} currency="INR" />
 *   <MoneyInput value={amount} onChange={setAmount} label="Amount" />
 */
export const MoneyInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
    value: string | number | null | undefined;
    onChange: (value: string) => void;
    /** ISO currency code. Defaults to "INR". */
    currency?: string;
    /** Show the currency symbol prefix. Default true. */
    showSymbol?: boolean;
  }
>(({ value, onChange, currency = "INR", showSymbol = true, className, disabled, ...props }, ref) => {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return (
    <div className="relative w-full">
      {showSymbol && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-caption font-medium text-muted-foreground sm:left-2">
          {symbol}
        </span>
      )}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-md border border-input bg-card text-foreground",
          "transition-[border-color,box-shadow] duration-100",
          "placeholder:text-faint tnum",
          "hover:border-border-strong",
          "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
          "disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
          "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20",
          "h-11 text-[14px] sm:h-8 sm:text-[13px]",
          showSymbol ? "pl-8 pr-3 sm:pl-7 sm:pr-2.5" : "px-3 sm:px-2.5",
          className,
        )}
        {...props}
      />
    </div>
  );
});
MoneyInput.displayName = "MoneyInput";

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "د.إ",
  SAR: "﷼",
  NPR: "रू",
  BDT: "৳",
  PKR: "₨",
  LKR: "Rs",
};
