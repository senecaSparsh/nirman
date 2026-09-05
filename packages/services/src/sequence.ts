import { type Prisma } from "@nirman/db";

/**
 * Atomic sequence number generator.
 *
 * Replaces the race-prone `count + 1` / `max + 1` pattern that causes
 * P2002 unique-constraint failures under concurrent load.
 *
 * Uses an atomic `upsert` + `update` on the `NumberSequence` table inside
 * the caller's Serializable transaction. The `UPDATE ... RETURNING`-style
 * operation is atomic at the row level, so two concurrent transactions
 * calling `nextSequenceNumber(tx, "PO-20260904-")` will get different
 * numbers (1, 2, 3, ...) without collisions.
 *
 * Usage:
 *   const poNumber = await nextSequenceNumber(tx, `PO-${ymd}-`, 4);
 *   // → "PO-20260904-0001"
 *
 * The number is gap-free per prefix. If the transaction rolls back, the
 * sequence row is also rolled back (it's inside the same tx), so no gaps
 * are introduced by failed transactions.
 *
 * @param tx    Prisma transaction client (must be inside a Serializable tx)
 * @param prefix  The sequence key, e.g. "PO-20260904-"
 * @param padLen  Zero-pad length for the numeric part (default 4)
 * @returns       The full number string, e.g. "PO-20260904-0001"
 */

/**
 * Format a sequence number with prefix and zero-padding.
 * Pure function — no DB access.
 *
 *   formatSeqNumber("PO-20260904-", 1, 4) → "PO-20260904-0001"
 *   formatSeqNumber("PO-20260904-", 42, 4) → "PO-20260904-0042"
 */
export function formatSeqNumber(prefix: string, seq: number, padLen = 4): string {
  return `${prefix}${String(seq).padStart(padLen, "0")}`;
}

export async function nextSequenceNumber(
  tx: Prisma.TransactionClient,
  prefix: string,
  padLen = 4,
): Promise<string> {
  // Atomic upsert: create the sequence row if it doesn't exist, then
  // atomically increment and return the new value. We use a two-step
  // approach because Prisma doesn't support `UPDATE ... RETURNING` directly,
  // but upsert inside a Serializable transaction is safe — only one tx
  // can hold the row lock at a time.
  const seq = await tx.numberSequence.upsert({
    where: { prefix },
    create: { prefix, nextSeq: 1 },
    update: { nextSeq: { increment: 1 } },
    select: { nextSeq: true },
  });

  // If this was a create, nextSeq is 1 (the initial value, not incremented).
  // If this was an update, nextSeq is the already-incremented value.
  // In both cases, the value we want is seq.nextSeq (1 for first, 2 for second, etc.)
  return `${prefix}${String(seq.nextSeq).padStart(padLen, "0")}`;
}
// hook-test-1788606314
