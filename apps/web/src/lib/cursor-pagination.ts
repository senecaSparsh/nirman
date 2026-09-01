/**
 * Cursor pagination utilities — shared by API routes that need
 * paginated responses.
 *
 * Cursor format: base64-encoded JSON of { createdAt, id }
 * This allows stable pagination even if new records are inserted
 * between page requests (cursor-based, not offset-based).
 *
 * Usage in a route handler:
 *   const { take, cursor, skip } = parseCursorParams(req);
 *   const records = await prisma.model.findMany({
 *     where: { ...filters, ...cursorToWhere(cursor) },
 *     take: take + 1,  // +1 to check if there's a next page
 *     orderBy: { createdAt: "desc" },
 *     skip,
 *   });
 *   const { items, nextCursor } = buildCursorResponse(records, take);
 *   return NextResponse.json({ items, nextCursor });
 */

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

interface CursorValue {
  createdAt: string;
  id: string;
}

export function parseCursorParams(req: Request) {
  const url = new URL(req.url);
  const take = Math.min(
    parseInt(url.searchParams.get("take") ?? String(DEFAULT_PAGE_SIZE), 10),
    MAX_PAGE_SIZE,
  );
  const cursorParam = url.searchParams.get("cursor");
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  const skip = cursor ? 1 : 0; // skip the cursor record itself
  return { take, cursor, skip };
}

export function decodeCursor(cursor: string): CursorValue | null {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    return JSON.parse(decoded) as CursorValue;
  } catch {
    return null;
  }
}

export function encodeCursor(value: CursorValue): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64");
}

/**
 * Converts a cursor to a Prisma `where` clause for cursor-based pagination.
 * Assumes orderBy: { createdAt: "desc" } — the cursor filters for records
 * created before the cursor's createdAt (or same createdAt but lower id).
 */
export function cursorToWhere(cursor: CursorValue | null): Record<string, unknown> | null {
  if (!cursor) return null;
  return {
    OR: [
      { createdAt: { lt: new Date(cursor.createdAt) } },
      {
        createdAt: new Date(cursor.createdAt),
        id: { lt: cursor.id },
      },
    ],
  };
}

/**
 * Builds the paginated response — slices off the extra record (take + 1)
 * and generates the next cursor if there are more records.
 */
export function buildCursorResponse<T extends { id: string; createdAt: Date }>(
  records: T[],
  take: number,
): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = records.length > take;
  const items = hasMore ? records.slice(0, take) : records;
  const lastRecord = items[items.length - 1];

  if (!lastRecord || !hasMore) {
    return { items, nextCursor: null, hasMore: false };
  }

  const nextCursor = encodeCursor({
    createdAt: lastRecord.createdAt.toISOString(),
    id: lastRecord.id,
  });

  return { items, nextCursor, hasMore };
}
