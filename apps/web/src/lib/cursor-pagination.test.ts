import { describe, it, expect } from "vitest";
import {
  parseCursorParams,
  decodeCursor,
  encodeCursor,
  cursorToWhere,
  buildCursorResponse,
} from "./cursor-pagination";

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a { createdAt, id } value", () => {
    const val = { createdAt: "2026-09-04T12:00:00.000Z", id: "abc-123" };
    const encoded = encodeCursor(val);
    expect(decodeCursor(encoded)).toEqual(val);
  });

  it("decodeCursor returns null for invalid base64", () => {
    expect(decodeCursor("!!!not-base64!!!")).toBeNull();
  });

  it("decodeCursor returns null for valid base64 but invalid JSON", () => {
    expect(decodeCursor(Buffer.from("not json").toString("base64"))).toBeNull();
  });
});

describe("parseCursorParams", () => {
  it("returns default page size when no take param", () => {
    const req = new Request("http://localhost/api/items");
    const { take, cursor, skip } = parseCursorParams(req);
    expect(take).toBe(50);
    expect(cursor).toBeNull();
    expect(skip).toBe(0);
  });

  it("respects the take param", () => {
    const req = new Request("http://localhost/api/items?take=10");
    const { take } = parseCursorParams(req);
    expect(take).toBe(10);
  });

  it("caps take at MAX_PAGE_SIZE (200)", () => {
    const req = new Request("http://localhost/api/items?take=999");
    const { take } = parseCursorParams(req);
    expect(take).toBe(200);
  });

  it("decodes the cursor param", () => {
    const cursor = encodeCursor({ createdAt: "2026-01-01T00:00:00Z", id: "x" });
    const req = new Request(`http://localhost/api/items?cursor=${cursor}`);
    const { cursor: decoded } = parseCursorParams(req);
    expect(decoded).toEqual({ createdAt: "2026-01-01T00:00:00Z", id: "x" });
  });
});

describe("cursorToWhere", () => {
  it("returns null when cursor is null", () => {
    expect(cursorToWhere(null)).toBeNull();
  });

  it("generates an OR clause with lt on the field and id", () => {
    const where = cursorToWhere({ createdAt: "2026-09-04T12:00:00Z", id: "abc" });
    expect(where).toEqual({
      OR: [
        { createdAt: { lt: new Date("2026-09-04T12:00:00Z") } },
        { createdAt: new Date("2026-09-04T12:00:00Z"), id: { lt: "abc" } },
      ],
    });
  });

  it("supports a custom field name", () => {
    const where = cursorToWhere({ createdAt: "2026-01-01T00:00:00Z", id: "x" }, "updatedAt");
    expect(where).toHaveProperty("OR.0.updatedAt");
  });
});

describe("buildCursorResponse", () => {
  it("returns all items with no cursor when records ≤ take", () => {
    const records = [{ id: "1", createdAt: new Date("2026-01-01") }, { id: "2", createdAt: new Date("2026-01-02") }];
    const result = buildCursorResponse(records, 10);
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it("slices to take and generates a nextCursor when records > take", () => {
    const records = [
      { id: "1", createdAt: new Date("2026-01-01") },
      { id: "2", createdAt: new Date("2026-01-02") },
      { id: "3", createdAt: new Date("2026-01-03") },
    ];
    const result = buildCursorResponse(records, 2);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
    // The cursor should encode the last item in the *page* (index 1)
    const decoded = decodeCursor(result.nextCursor!);
    expect(decoded).toEqual({ createdAt: "2026-01-02T00:00:00.000Z", id: "2" });
  });

  it("handles empty records", () => {
    const result = buildCursorResponse([], 10);
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it("supports a custom getCursorValue mapper", () => {
    const records = [
      { key: "a", ts: "2026-01-01T00:00:00Z" },
      { key: "b", ts: "2026-01-02T00:00:00Z" },
      { key: "c", ts: "2026-01-03T00:00:00Z" },
    ];
    const result = buildCursorResponse(records, 2, (r) => ({ createdAt: r.ts, id: r.key }));
    expect(result.hasMore).toBe(true);
    const decoded = decodeCursor(result.nextCursor!);
    expect(decoded).toEqual({ createdAt: "2026-01-02T00:00:00Z", id: "b" });
  });
});
