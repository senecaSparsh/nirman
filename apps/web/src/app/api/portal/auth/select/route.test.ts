import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";
import { signPortalPreauthToken, PORTAL_PREAUTH_COOKIE_NAME } from "@/lib/portal-auth";

const TEST_PHONE = "+919876543210";
const TEST_PHONE_NORMALIZED = "919876543210";

// Helper: create a NextRequest-like object with cookies support
function makeRequestWithCookies(
  url: string,
  opts: { method: string; body: unknown },
  cookies: Record<string, string> = {},
) {
  const req = makeRequest(url, opts);
  // Add a cookies mock that matches NextRequest.cookies API
  const cookieStore = Object.entries(cookies).map(([name, value]) => ({ name, value }));
  Object.defineProperty(req, "cookies", {
    get: () => ({
      get: (name: string) => cookieStore.find((c) => c.name === name),
      getAll: () => cookieStore,
    }),
  });
  return req;
}

// Helper: request with valid pre-auth cookie
function makeRequestWithPreauth(body: Record<string, unknown>) {
  const token = signPortalPreauthToken(TEST_PHONE_NORMALIZED);
  return makeRequestWithCookies(
    "/api/portal/auth/select",
    { method: "POST", body: { phone: TEST_PHONE, ...body } },
    { [PORTAL_PREAUTH_COOKIE_NAME]: token },
  );
}

describe("POST /api/portal/auth/select", () => {
  beforeEach(() => {
    mockPrisma().customer!.findUnique.mockResolvedValue({
      id: "cust-1",
      name: "John Doe",
      phone: "+919876543210",
      company: { name: "Test Co" },
    });
  });

  it("returns 400 when customerId is missing", async () => {
    const res = await POST(makeRequestWithPreauth({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when phone is missing", async () => {
    const req = makeRequestWithCookies(
      "/api/portal/auth/select",
      { method: "POST", body: { customerId: "cust-1" } },
      { [PORTAL_PREAUTH_COOKIE_NAME]: signPortalPreauthToken(TEST_PHONE_NORMALIZED) },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when pre-auth cookie is missing", async () => {
    const res = await POST(
      makeRequestWithCookies("/api/portal/auth/select", { method: "POST", body: { customerId: "cust-1", phone: TEST_PHONE } }, {}),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when customer is not found", async () => {
    mockPrisma().customer!.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequestWithPreauth({ customerId: "nope" }));
    expect(res.status).toBe(404);
  });

  it("selects a customer and sets the portal cookie", async () => {
    const res = await POST(makeRequestWithPreauth({ customerId: "cust-1" }));
    expect(res.status).toBe(200);
    const body = await getJson<{ customer: { id: string; name: string; companyName: string } }>(res);
    expect(body.customer.id).toBe("cust-1");
    expect(body.customer.name).toBe("John Doe");
    expect(body.customer.companyName).toBe("Test Co");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("nirman-portal-customer");
  });

  it("returns 403 when customer phone does not match verified phone", async () => {
    mockPrisma().customer!.findUnique.mockResolvedValue({
      id: "cust-2",
      name: "Wrong Person",
      phone: "+919999999999",
      company: { name: "Other Co" },
    });
    const res = await POST(makeRequestWithPreauth({ customerId: "cust-2" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/portal/auth/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});
