import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  authMocks,
  setSessionUser,
  clearSession,
  makeRequest,
  getJson,
  mockPrisma,
} from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    notifyPaymentDue: vi.fn().mockResolvedValue(undefined),
    emitNotificationEvent: vi.fn().mockResolvedValue(undefined),
    NotificationEventType: actual.NotificationEventType,
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

const OWNER = { role: "OWNER" as const };
const STORE_KEEPER = { role: "STORE_KEEPER" as const };

describe("POST /api/payments/send-reminders", () => {
  beforeEach(() => {
    setSessionUser(OWNER);
    mockPrisma().paymentScheduleItem!.findMany.mockResolvedValue([]);
    mockPrisma().landPurchasePaymentScheduleItem!.findMany.mockResolvedValue([]);
    mockPrisma().tenancy!.findMany.mockResolvedValue([]);
  });

  it("returns 200 with remindersSent=0 when no pending payments", async () => {
    const res = await POST(makeRequest("/api/payments/send-reminders", { method: "POST", body: {} }), {});
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean; remindersSent: number; reminders: unknown[] }>(res);
    expect(body.ok).toBe(true);
    expect(body.remindersSent).toBe(0);
  });

  it("returns 200 with SALE type filter", async () => {
    const res = await POST(
      makeRequest("/api/payments/send-reminders", { method: "POST", body: { type: "SALE" } }),
      {},
    );
    expect(res.status).toBe(200);
  });

  it("returns 200 with LAND type filter", async () => {
    const res = await POST(
      makeRequest("/api/payments/send-reminders", { method: "POST", body: { type: "LAND" } }),
      {},
    );
    expect(res.status).toBe(200);
  });

  it("returns 200 with RENT type filter", async () => {
    const res = await POST(
      makeRequest("/api/payments/send-reminders", { method: "POST", body: { type: "RENT" } }),
      {},
    );
    expect(res.status).toBe(200);
  });

  it("returns 403 when the user lacks FINANCE_MANAGE", async () => {
    setSessionUser(STORE_KEEPER);
    const res = await POST(makeRequest("/api/payments/send-reminders", { method: "POST", body: {} }), {});
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    clearSession();
    const res = await POST(makeRequest("/api/payments/send-reminders", { method: "POST", body: {} }), {});
    expect(res.status).toBe(401);
  });

  it("sends reminders for pending sale payments with customer info", async () => {
    mockPrisma().paymentScheduleItem!.findMany.mockResolvedValue([
      {
        id: "psi-1",
        totalAmount: 500000,
        dueDate: new Date("2024-01-20"),
        status: "PENDING",
        paymentSchedule: {
          assetSale: {
            id: "sale-1",
            saleDeedNo: "SD-001",
            customer: { id: "cust-1", name: "Rajesh", phone: "9999999999", email: "rajesh@test.com" },
          },
        },
      },
    ]);
    const res = await POST(
      makeRequest("/api/payments/send-reminders", { method: "POST", body: { type: "SALE" } }),
      {},
    );
    expect(res.status).toBe(200);
    const body = await getJson<{ ok: boolean; remindersSent: number }>(res);
    expect(body.remindersSent).toBe(1);
  });
});
