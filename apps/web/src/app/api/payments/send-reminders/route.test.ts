import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, setCompany, makeRequest, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    notifyPaymentDue: vi.fn().mockResolvedValue(undefined),
    emitNotificationEvent: vi.fn().mockResolvedValue(undefined),
  };
});

import { POST } from "./route";

const OWNER = { role: "OWNER" as const, id: "user-owner-1" };

function post(body: unknown) {
  return makeRequest("/api/payments/send-reminders", { method: "POST", body });
}
const CTX = { params: Promise.resolve({}) };

describe("POST /api/payments/send-reminders", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    setCompany({ id: "co-1" });
    mockPrisma().paymentScheduleItem!.findMany.mockResolvedValue([]);
    mockPrisma().landPurchasePaymentScheduleItem!.findMany.mockResolvedValue([]);
    mockPrisma().tenancy!.findMany.mockResolvedValue([]);
    mockPrisma().userCompany!.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.userId_companyId?.userId === OWNER.id) {
        return { id: "m-owner", userId: OWNER.id, companyId: "co-1", role: "OWNER", active: true, userPermissions: [] };
      }
      return null;
    });
  });

  it("rejects an absurd daysAhead (would mass-remind every pending payment)", async () => {
    const res = await POST(post({ daysAhead: 99999 }), CTX);
    expect(res.status).toBe(400);
  });

  it("rejects a non-numeric daysAhead", async () => {
    const res = await POST(post({ daysAhead: "soon" }), CTX);
    expect(res.status).toBe(400);
  });

  it("rejects a bogus type", async () => {
    const res = await POST(post({ type: "EVERYTHING" }), CTX);
    expect(res.status).toBe(400);
  });

  it("accepts the default empty-ish body", async () => {
    const res = await POST(post({}), CTX);
    expect(res.status).toBe(200);
  });

  it("accepts a valid scoped request", async () => {
    const res = await POST(post({ type: "SALE", daysAhead: 14 }), CTX);
    expect(res.status).toBe(200);
  });
});
