import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, setCompany, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => {}),
}));

import { SettingsContent } from "./content";

describe("settings page data loads — membership scoping", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    setCompany({ id: "co-1" });
    // OWNER membership so the COMPANY_MANAGE gate passes.
    mockPrisma().userCompany!.findUnique.mockResolvedValue({
      id: "uc-owner",
      role: "OWNER",
      activeRole: null,
      secondaryRoles: [],
      active: true,
      userPermissions: [],
      scopes: [],
    });
  });

  it("the user list only counts members whose membership in this company is active", async () => {
    await SettingsContent();
    expect(mockPrisma().user!.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberships: { some: { companyId: "co-1", active: true } },
        }),
      }),
    );
  });

  it("the company list only counts active memberships for a non-superuser manager", async () => {
    // A manager-tier member (COMPANY_MANAGE via grant) hits the non-superuser
    // branch — a company they were terminated from must not appear.
    setSessionUser({ role: "FINANCE_HEAD" });
    mockPrisma().userCompany!.findUnique.mockResolvedValue({
      id: "uc-fh",
      role: "FINANCE_HEAD",
      activeRole: null,
      secondaryRoles: [],
      active: true,
      userPermissions: [{ permission: "company.manage" }],
      scopes: [],
    });
    await SettingsContent();
    expect(mockPrisma().company!.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userMemberships: { some: { userId: "user-owner-1", active: true } },
        }),
      }),
    );
  });
});
