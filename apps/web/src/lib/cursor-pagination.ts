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
  // No skip needed — cursorToWhere already filters out the cursor record
  // by using lt/eq+lt conditions.
  return { take, cursor, skip: 0 };
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
 * Assumes orderBy: { [field]: "desc" } — the cursor filters for records
 * with a lower field value (or same field value but lower id).
 *
 * @param cursor The decoded cursor value
 * @param field The field name used for ordering (default: "createdAt")
 */
export function cursorToWhere(
  cursor: CursorValue | null,
  field: string = "createdAt",
): Record<string, unknown> | null {
  if (!cursor) return null;
  const dateValue = new Date(cursor.createdAt);
  return {
    OR: [
      { [field]: { lt: dateValue } },
      {
        [field]: dateValue,
        id: { lt: cursor.id },
      },
    ],
  };
}

/**
 * Builds the paginated response — slices off the extra record (take + 1)
 * and generates the next cursor if there are more records.
 *
 * Pass `getCursorValue` if your records don't have { id, createdAt: Date }
 * directly (e.g. after mapping to a DTO with string dates).
 */
export function buildCursorResponse<T>(
  records: T[],
  take: number,
  getCursorValue?: (record: T) => CursorValue,
): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = records.length > take;
  const items = hasMore ? records.slice(0, take) : records;
  const lastRecord = items[items.length - 1];

  if (!lastRecord || !hasMore) {
    return { items, nextCursor: null, hasMore: false };
  }

  let cursorVal: CursorValue;
  if (getCursorValue) {
    cursorVal = getCursorValue(lastRecord);
  } else {
    // Default: expect { id, createdAt: Date } on the record
    const record = lastRecord as unknown as { id: string; createdAt: Date | string };
    cursorVal = {
      createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
      id: record.id,
    };
  }

  return { items, nextCursor: encodeCursor(cursorVal), hasMore };
}
