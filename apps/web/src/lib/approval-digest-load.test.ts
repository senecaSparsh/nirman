import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("@nirman/services", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nirman/services")>()),
  resolveUserScope: vi.fn(),
}));

import { loadApprovalDigestInputs } from "./approval-digest-load";
import { resolveUserScope } from "@nirman/services";

const INPUT = {
  companyId: "co-1",
  now: new Date("2026-03-10T09:00:00Z"),
  cutoff: new Date("2026-03-09T09:00:00Z"),
  startOfToday: new Date("2026-03-10T00:00:00Z"),
  managerThreshold: null,
  adminThreshold: null,
};

// An active member with an approval permission — PROJECT_MANAGER can approve POs.
const MEMBER_ROW = {
  id: "m-1",
  userId: "u-1",
  role: "PROJECT_MANAGER",
  activeRole: null,
  secondaryRoles: [],
  scopeType: null,
  userPermissions: [],
};

describe("loadApprovalDigestInputs — member enumeration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSessionUser({ role: "OWNER" });
    // The delegator query shares userCompany.findMany — distinguish by where clause.
    mockPrisma().userCompany!.findMany.mockImplementation(async ({ where }: any) =>
      where?.approvalsDelegatedToId ? [] : [MEMBER_ROW],
    );
  });

  it("includes a member whose scope resolves", async () => {
    vi.mocked(resolveUserScope).mockResolvedValue({ scopeType: "COMPANY", departmentIds: [], projectIds: [] });
    const out = await loadApprovalDigestInputs(INPUT);
    expect(out.members.map((m) => m.userId)).toEqual(["u-1"]);
  });

  it("skips a member whose scope no longer resolves instead of widening them to company scope", async () => {
    // A membership deactivated between enumeration and scope resolution
    // returns null — the digest must drop them, not fail open to COMPANY.
    vi.mocked(resolveUserScope).mockResolvedValue(null);
    const out = await loadApprovalDigestInputs(INPUT);
    expect(out.members).toEqual([]);
  });
});
