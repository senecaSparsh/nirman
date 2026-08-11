import { ServiceError } from "./errors";

/**
 * Optimistic Locking Utility
 *
 * Provides concurrent edit conflict detection via a `version` field.
 * When a client reads a record, it gets the current `version`. On update,
 * the client sends that version. If the version in the DB doesn't match,
 * someone else has modified the record in between → reject with a 409 Conflict.
 *
 * The `version` field is added to models that are commonly edited by multiple
 * users concurrently: Material, Project, Employee, Customer, Supplier, BuiltUnit.
 *
 * In API route handlers, check the version inline:
 *
 *   const expectedVersion = extractVersion(body);
 *   if (expectedVersion !== undefined && existing.version !== expectedVersion) {
 *     return json({ error: new ConcurrentEditError(...).message, code: "CONCURRENT_EDIT" }, { status: 409 });
 *   }
 *   // ... proceed with update, incrementing version:
 *   await tx.material.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
 */

export class ConcurrentEditError extends ServiceError {
  constructor(entityType: string, id: string, expectedVersion: number, actualVersion: number) {
    super(
      `Concurrent edit detected on ${entityType} ${id}: expected version ${expectedVersion}, but current version is ${actualVersion}. Please reload and try again.`,
      409,
    );
    this.name = "ConcurrentEditError";
  }
}

/**
 * Helper to extract version from a request body.
 * Clients send `version` in the request body; this returns it or undefined.
 * Returns undefined if version is missing or invalid (backward compatible —
 * old clients that don't send version skip the check).
 */
export function extractVersion(body: { version?: number }): number | undefined {
  if (typeof body.version !== "number" || body.version < 0) return undefined;
  return body.version;
}
