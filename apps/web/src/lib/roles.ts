/**
 * Role-based access control for Nirman Inventory OS.
 *
 * The canonical role matrix, permission vocabulary, and helpers now live in
 * the shared `@nirman/rbac` package (`packages/rbac`) so server-side code in
 * `@nirman/services` (push fan-out, schedulers) can resolve the same
 * role→permission checks as the web layer. This file re-exports everything
 * so the 600+ existing `@/lib/roles` imports keep working unchanged.
 */
export * from "@nirman/rbac";
