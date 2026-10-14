import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";
import { PERM, type Role } from "@/lib/roles";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    lowStockAlerts: vi.fn().mockResolvedValue([]),
    getCompanyPortfolioSummary: vi.fn().mockResolvedValue({}),
    trialBalance: vi.fn().mockResolvedValue([]),
  };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { POST } from "./route";

const CUSTOM_KEY = "CUSTOM_FIELD_AUDITOR" as Role;

function defineCustomRole(opts: { label: string; tier: number; permissions: string[] }) {
  const db = mockPrisma();
  db.customRole!.findFirst.mockResolvedValue({ companyId: "company-1", key: CUSTOM_KEY, baseRole: null, ...opts });
  db.customRole!.findMany.mockResolvedValue([{ companyId: "company-1", key: CUSTOM_KEY, label: opts.label }]);
}

async function ask(text: string) {
  const res = await POST(makeRequest("/api/assistant", { method: "POST", body: { text } }), {});
  expect(res.status).toBe(200);
  return getJson<{ text: string }>(res);
}

describe("POST /api/assistant as a custom job role", () => {
  beforeEach(() => {
    setSessionUser({ role: CUSTOM_KEY });
  });

  it("refuses a finance question its own permissions do not grant, even though its tier stand-in would allow it", async () => {
    defineCustomRole({ label: "Finance lead", tier: 2, permissions: [PERM.INVENTORY_VIEW] });
    const body = await ask("cash position kya hai?");
    expect(body.text).toContain("Finance lead");
    expect(body.text).toContain("permission chahiye");
  });

  it("shows only the help sections its own permission list unlocks", async () => {
    defineCustomRole({ label: "Store auditor", tier: 4, permissions: [PERM.INVENTORY_VIEW] });
    const body = await ask("help");
    expect(body.text).toContain("Stock & Inventory");
    expect(body.text).not.toContain("**Approvals**");
  });

  it("shows a granted approval section to a custom role that holds the approval permission", async () => {
    defineCustomRole({ label: "Procurement clerk", tier: 4, permissions: [PERM.PO_APPROVE] });
    const body = await ask("help");
    expect(body.text).toContain("**Approvals**");
    expect(body.text).not.toContain("Stock & Inventory");
  });

  it("never shows the raw CUSTOM_ key to the user", async () => {
    defineCustomRole({ label: "Store auditor", tier: 4, permissions: [PERM.INVENTORY_VIEW] });
    const body = await ask("cash position kya hai?");
    expect(body.text).not.toContain("CUSTOM_");
  });
});
