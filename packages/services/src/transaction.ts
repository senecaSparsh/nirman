import { prisma, type Prisma } from "@nirman/db";
import { ServiceError } from "./errors";

/**
 * Run a function inside a Serializable-isolation transaction with automatic
 * retry on write conflicts / deadlocks / unique-constraint collisions.
 * Use this for any mutation that:
 *   - Generates auto-numbers (PO, requisition, sale numbers via COUNT + 1)
 *   - Reads then writes the same row (status transitions, payment recording)
 *   - Is susceptible to lost updates under concurrent access
 *
 * Serializable isolation guarantees that the transaction's outcome is the same
 * as if it ran serially — at the cost of occasional retries when conflicts
 * occur. The retry loop uses exponential backoff with jitter.
 *
 * P2002 (unique constraint) errors are retried because they can occur when
 * two concurrent transactions compute the same sequence number (e.g. count+1).
 * The callback fn is re-invoked on each retry, so it should be idempotent —
 * any sequence-number generation inside it will get a fresh value.
 */

/**
 * Determine if a transaction error is retryable.
 * Pure function — no DB access.
 *
 * Retryable: write conflict, deadlock, serialization failure, P2002 unique constraint.
 */
export function isRetryableTransactionError(err: unknown): boolean {
  if (err == null) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string }).code;
  return (
    msg.includes("write conflict") ||
    msg.includes("deadlock") ||
    msg.includes("could not serialize") ||
    code === "P2002"
  );
}

/**
 * Compute the retry backoff base delay for a given attempt (without jitter).
 * Pure function — no DB access, no Math.random side effect.
 *
 *   baseDelay = 100 × 2^attempt  (100ms, 200ms, 400ms, 800ms, 1600ms)
 */
export function computeRetryBackoff(attempt: number): number {
  return 100 * Math.pow(2, attempt);
}

export async function withSerializableTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const MAX_RETRIES = 5;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        timeout: 15000,
        isolationLevel: "Serializable",
      });
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string }).code;
      // Retry on write conflict / deadlock (Serializable isolation can cause these)
      // Also retry on P2002 unique-constraint violations (sequence number collisions)
      const isRetryable =
        msg.includes("write conflict") ||
        msg.includes("deadlock") ||
        msg.includes("could not serialize") ||
        code === "P2002";
      if (isRetryable) {
        // Exponential backoff with jitter: 100ms, 200ms, 400ms, 800ms, 1600ms
        const baseDelay = 100 * Math.pow(2, attempt);
        const jitter = Math.random() * 50;
        await new Promise((r) => setTimeout(r, baseDelay + jitter));
        continue;
      }
      throw err;
    }
  }
  throw new ServiceError(
    "This operation conflicted with another concurrent transaction. Please retry.",
    409,
  );
}
