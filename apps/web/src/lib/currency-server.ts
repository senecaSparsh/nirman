import { AsyncLocalStorage } from "node:async_hooks";
import { registerServerModeGetter, type CurrencyMode } from "@/lib/utils";

export type { CurrencyMode };

/**
 * Server-only currency mode bridge.
 *
 * This module imports `node:async_hooks` (a Node builtin that can't be
 * bundled for the browser) and wires it into `formatCurrency()` via the
 * `registerServerModeGetter` indirection. This keeps utils.ts clean for
 * both server and client bundles.
 *
 * The root layout calls `runWithCurrencyMode()` once per request, reading
 * the user's cookie preference. Every `formatCurrency()` call within
 * that request — in any server component, at any depth — automatically
 * picks up the mode from AsyncLocalStorage. No call site ever passes
 * the mode parameter.
 */

const currencyModeALS = new AsyncLocalStorage<CurrencyMode>();

// Wire the ALS into formatCurrency() — called once at module load.
registerServerModeGetter(() => currencyModeALS.getStore());

/**
 * Wrap a server render in a currency-mode context. Called once in the
 * root layout. All `formatCurrency()` calls inside automatically pick
 * up the mode — no parameter needed at any call site.
 */
export function runWithCurrencyMode<T>(mode: CurrencyMode, fn: () => T): T {
  return currencyModeALS.run(mode, fn);
}
