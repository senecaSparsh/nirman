/**
 * Tenant-isolation + custom-role RBAC regression tests (real test DB).
 *
 * Covers the bugs found in the owner employee-management audit:
 *
 *   updateEmployee        — relation fields (departmentId, reportingLocationId,
 *                           reportsToEmployeeId) must belong to the caller's
 *                           company; previously they connected cross-tenant or
 *                           threw a Prisma P2025 500 on bad ids.
 *   assignScopedMembership — CUSTOM_* roles resolve to their stored tier; a
 *                           CUSTOM_ string fed to the built-in tier table
 *                           normalizes to tier 5, which let a tier-3 actor
 *                           manage a tier-2 member.
 *   resolveUserScope      — custom roles inherit their baseRole's default
 *                           scope (PROJECT for SITE_ENGINEER), not the
 *                           fail-open COMPANY fallback for unknown strings.
 *   createNcr             — the project lookup is scoped to the caller's
 *                           company so an NCR can never be written into a
 *                           foreign tenant.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "@nirman/db";
import { updateEmployee, createEmployee } from "../hr";
import { issueMaterialsToProject } from "../issue";
import { createNcr } from "../quality-control";
import { assignScopedMembership, resolveUserScope } from "../rbac";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";

// Notifications are fire-and-forget side effects — silence them.
vi.mock("../notifications", () => ({
  emitNotificationEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("tenant isolation + custom-role RBAC", () => {
  beforeAll(async () => {
    const result = await prisma.$queryRaw<{ current_database: string }[]>`
      SELECT current_database()
    `;
    expect(result[0]?.current_database).toBe("nirman_inventory_test");
  });

  beforeEach(async () => {
    await resetDb();
  });

  /** A second company with its own department / employee / location / project. */
  async function createForeignTenant() {
    const company = await prisma.company.create({
      data: { id: "foreign-company", name: "Foreign Co.", currency: "INR" },
    });
    const department = await prisma.department.create({
      data: { companyId: company.id, code: "FD", name: "Foreign Dept" },
    });
    const location = await prisma.stockLocation.create({
      data: { id: "foreign-location", companyId: company.id, name: "Foreign WH", type: "COMPANY_WAREHOUSE" },
    });
    const employee = await prisma.employee.create({
      data: { companyId: company.id, name: "Foreign Employee" },
    });
    const project = await prisma.project.create({
      data: { id: "foreign-project", companyId: company.id, name: "Foreign Project", status: "ACTIVE" },
    });
    return { company, department, location, employee, project };
  }

  async function createUser(id: string, name: string, companyId: string, role: string) {
    const user = await prisma.user.create({
      data: { id, email: `${id}@test.in`, name, role, companyId },
    });
    const membership = await prisma.userCompany.create({
      data: { userId: user.id, companyId, role },
    });
    return { user, membership };
  }

  // ── updateEmployee: cross-tenant relation guards ──────────────

  describe("updateEmployee relation guards", () => {
    it("rejects a department from another company", async () => {
      const { company } = await createTestFixture();
      const foreign = await createForeignTenant();
      const emp = await prisma.employee.create({ data: { companyId: company.id, name: "Emp" } });

      await expect(
        updateEmployee({ employeeId: emp.id, companyId: company.id, departmentId: foreign.department.id }),
      ).rejects.toMatchObject({ message: "Department not found in this company", status: 404 });
    });

    it("rejects a nonexistent department cleanly (404, not Prisma P2025)", async () => {
      const { company } = await createTestFixture();
      const emp = await prisma.employee.create({ data: { companyId: company.id, name: "Emp" } });

      await expect(
        updateEmployee({ employeeId: emp.id, companyId: company.id, departmentId: "no-such-dept" }),
      ).rejects.toMatchObject({ message: "Department not found in this company", status: 404 });
    });

    it("rejects a reporting manager from another company", async () => {
      const { company } = await createTestFixture();
      const foreign = await createForeignTenant();
      const emp = await prisma.employee.create({ data: { companyId: company.id, name: "Emp" } });

      await expect(
        updateEmployee({ employeeId: emp.id, companyId: company.id, reportsToEmployeeId: foreign.employee.id }),
      ).rejects.toMatchObject({ message: "Reporting manager not found in this company", status: 404 });
    });

    it("rejects a reporting location from another company", async () => {
      const { company } = await createTestFixture();
      const foreign = await createForeignTenant();
      const emp = await prisma.employee.create({ data: { companyId: company.id, name: "Emp" } });

      await expect(
        updateEmployee({ employeeId: emp.id, companyId: company.id, reportingLocationId: foreign.location.id }),
      ).rejects.toMatchObject({ message: "Reporting location not found in this company", status: 404 });
    });

    it("accepts same-company department + reporting manager", async () => {
      const { company } = await createTestFixture();
      const dept = await prisma.department.create({
        data: { companyId: company.id, code: "QA", name: "QA Dept" },
      });
      const mgr = await prisma.employee.create({ data: { companyId: company.id, name: "Mgr" } });
      const emp = await prisma.employee.create({ data: { companyId: company.id, name: "Emp" } });

      await updateEmployee({
        employeeId: emp.id,
        companyId: company.id,
        departmentId: dept.id,
        reportsToEmployeeId: mgr.id,
      });

      const after = await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } });
      expect(after.departmentId).toBe(dept.id);
      expect(after.reportsToEmployeeId).toBe(mgr.id);
    });
  });

  // ── updateEmployee: absent-vs-null field contract ─────────────
  // undefined (key absent) must leave the column untouched; null must clear
  // it. The API route relied on this — a `?? null` in the route wiped
  // monthlySalary on every unrelated PATCH, and `?? undefined` swallowed
  // explicit clears for dailyRate / reportsTo / department.

  describe("updateEmployee absent-vs-null contract", () => {
    it("leaves wage fields untouched when they are absent from the input", async () => {
      const { company } = await createTestFixture();
      const emp = await prisma.employee.create({
        data: { companyId: company.id, name: "Emp", wageType: "MONTHLY", monthlySalary: 48000, dailyRate: 850 },
      });

      // Simulates a dossier-only PATCH (e.g. PAN update) — no wage keys.
      await updateEmployee({ employeeId: emp.id, companyId: company.id, phone: "9999999999" });

      const after = await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } });
      expect(after.phone).toBe("9999999999");
      expect(Number(after.monthlySalary)).toBe(48000);
      expect(Number(after.dailyRate)).toBe(850);
    });

    it("clears monthlySalary on explicit null", async () => {
      const { company } = await createTestFixture();
      const emp = await prisma.employee.create({
        data: { companyId: company.id, name: "Emp", wageType: "MONTHLY", monthlySalary: 48000 },
      });

      await updateEmployee({ employeeId: emp.id, companyId: company.id, monthlySalary: null });

      const after = await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } });
      expect(after.monthlySalary).toBeNull();
    });

    it("clears dailyRate to 0 on explicit null (column is NOT NULL)", async () => {
      const { company } = await createTestFixture();
      const emp = await prisma.employee.create({
        data: { companyId: company.id, name: "Emp", wageType: "DAILY", dailyRate: 850 },
      });

      await updateEmployee({ employeeId: emp.id, companyId: company.id, dailyRate: null });

      const after = await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } });
      expect(Number(after.dailyRate)).toBe(0);
    });

    it("disconnects reportsTo / department on explicit null", async () => {
      const { company } = await createTestFixture();
      const dept = await prisma.department.create({
        data: { companyId: company.id, code: "QA", name: "QA Dept" },
      });
      const mgr = await prisma.employee.create({ data: { companyId: company.id, name: "Mgr" } });
      const emp = await prisma.employee.create({
        data: { companyId: company.id, name: "Emp", departmentId: dept.id, reportsToEmployeeId: mgr.id },
      });

      await updateEmployee({
        employeeId: emp.id,
        companyId: company.id,
        reportsToEmployeeId: null,
        departmentId: null,
      });

      const after = await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } });
      expect(after.reportsToEmployeeId).toBeNull();
      expect(after.departmentId).toBeNull();
    });
  });

  // ── createEmployee: same cross-tenant relation guards ─────────

  describe("createEmployee relation guards", () => {
    it("rejects a department from another company", async () => {
      const { company } = await createTestFixture();
      const foreign = await createForeignTenant();

      await expect(
        createEmployee({ companyId: company.id, name: "Emp", departmentId: foreign.department.id }),
      ).rejects.toMatchObject({ message: "Department not found in this company", status: 404 });
    });

    it("rejects a reporting location from another company", async () => {
      const { company } = await createTestFixture();
      const foreign = await createForeignTenant();

      await expect(
        createEmployee({ companyId: company.id, name: "Emp", reportingLocationId: foreign.location.id }),
      ).rejects.toMatchObject({ message: "Reporting location not found in this company", status: 404 });
    });

    it("creates an employee with same-company relations", async () => {
      const { company, stockLocation } = await createTestFixture();
      const dept = await prisma.department.create({
        data: { companyId: company.id, code: "QA", name: "QA Dept" },
      });

      const emp = await createEmployee({
        companyId: company.id,
        name: "Valid Worker",
        departmentId: dept.id,
        reportingLocationId: stockLocation.id,
      });

      expect(emp.departmentId).toBe(dept.id);
      expect(emp.reportingLocationId).toBe(stockLocation.id);
    });
  });

  // ── assignScopedMembership: custom-role tier resolution ───────

  describe("assignScopedMembership custom-role tiers", () => {
    it("a tier-3 actor cannot reassign a member holding a tier-2 custom role", async () => {
      const { company, project } = await createTestFixture();
      await prisma.customRole.create({
        data: { companyId: company.id, key: "CUSTOM_DIRECTOR", label: "Director", baseRole: "PROJECT_DIRECTOR", tier: 2, permissions: [] },
      });
      const target = await createUser("t1", "Director User", company.id, "CUSTOM_DIRECTOR");
      const hr = await createUser("hr1", "HR Manager", company.id, "HR_MANAGER");

      // Before the fix, CUSTOM_DIRECTOR normalized to SUPERVISOR (tier 5) and
      // the tier-3 actor passed the hierarchy check.
      await expect(
        assignScopedMembership({
          actorUserId: hr.user.id,
          userId: target.user.id,
          companyId: company.id,
          role: "SUPERVISOR",
          scopeEntries: [{ projectId: project.id }],
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("a tier-1 actor CAN assign a custom role (tier resolved from the DB row)", async () => {
      const { company, project, user } = await createTestFixture(); // fixture user is OWNER
      await prisma.customRole.create({
        data: { companyId: company.id, key: "CUSTOM_SITE_LEAD", label: "Site Lead", baseRole: "SITE_ENGINEER", tier: 4, permissions: ["qc.manage"] },
      });
      const target = await createUser("t2", "New Member", company.id, "SUPERVISOR");

      const membership = await assignScopedMembership({
        actorUserId: user.id,
        userId: target.user.id,
        companyId: company.id,
        role: "CUSTOM_SITE_LEAD",
        scopeEntries: [{ projectId: project.id }],
      });

      expect(membership?.role).toBe("CUSTOM_SITE_LEAD");
    });

    it("rejects an unknown role string (fails closed, not normalized)", async () => {
      const { company, user } = await createTestFixture();
      const target = await createUser("t3", "New Member", company.id, "SUPERVISOR");

      await expect(
        assignScopedMembership({
          actorUserId: user.id,
          userId: target.user.id,
          companyId: company.id,
          role: "GARBAGE_ROLE_XYZ",
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("fails closed on a stored custom role that no longer exists", async () => {
      const { company, project, user } = await createTestFixture();
      // Membership references a custom role that was deleted — the actor
      // must NOT be able to touch it (previously normalized to tier 5).
      const target = await createUser("t4", "Ghost Role", company.id, "CUSTOM_DELETED_ROLE");

      await expect(
        assignScopedMembership({
          actorUserId: user.id,
          userId: target.user.id,
          companyId: company.id,
          role: "SUPERVISOR",
          scopeEntries: [{ projectId: project.id }],
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  // ── assignScopedMembership: reporting-line cycles ─────────────

  describe("assignScopedMembership reporting cycles", () => {
    it("rejects a two-way reporting loop and leaves reportsTo unchanged", async () => {
      const { company, user } = await createTestFixture();
      const a = await createUser("cycleA", "Member A", company.id, "PROJECT_MANAGER");
      const b = await createUser("cycleB", "Member B", company.id, "PROJECT_MANAGER");

      // A reports to B.
      await assignScopedMembership({
        actorUserId: user.id,
        userId: a.user.id,
        companyId: company.id,
        role: "PROJECT_MANAGER",
        scopeType: "COMPANY",
        reportsToUserCompanyId: b.membership.id,
      });

      // B reports to A would close the loop — must be refused, and B's
      // reportsTo must stay null (the old check walked the wrong chain).
      await expect(
        assignScopedMembership({
          actorUserId: user.id,
          userId: b.user.id,
          companyId: company.id,
          role: "PROJECT_MANAGER",
          scopeType: "COMPANY",
          reportsToUserCompanyId: a.membership.id,
        }),
      ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("cycle") });

      const after = await prisma.userCompany.findUniqueOrThrow({ where: { id: b.membership.id } });
      expect(after.reportsToUserCompanyId).toBeNull();
    });

    it("rejects self-reporting on a membership", async () => {
      const { company, user } = await createTestFixture();
      const a = await createUser("selfA", "Member A", company.id, "PROJECT_MANAGER");

      await expect(
        assignScopedMembership({
          actorUserId: user.id,
          userId: a.user.id,
          companyId: company.id,
          role: "PROJECT_MANAGER",
          scopeType: "COMPANY",
          reportsToUserCompanyId: a.membership.id,
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("allows reporting to a transitive manager's sibling (no loop)", async () => {
      const { company, user } = await createTestFixture();
      const owner = await prisma.userCompany.findUniqueOrThrow({
        where: { userId_companyId: { userId: user.id, companyId: company.id } },
      });
      const a = await createUser("okA", "Member A", company.id, "PROJECT_MANAGER");
      const b = await createUser("okB", "Member B", company.id, "PROJECT_MANAGER");

      // A reports to B; B reports to owner — a normal chain, no loop.
      await assignScopedMembership({
        actorUserId: user.id, userId: a.user.id, companyId: company.id,
        role: "PROJECT_MANAGER", scopeType: "COMPANY",
        reportsToUserCompanyId: b.membership.id,
      });
      const result = await assignScopedMembership({
        actorUserId: user.id, userId: b.user.id, companyId: company.id,
        role: "PROJECT_MANAGER", scopeType: "COMPANY",
        reportsToUserCompanyId: owner.id,
      });
      expect(result?.reportsToUserCompanyId).toBe(owner.id);
    });
  });

  // ── assignScopedMembership: preserve semantics ────────────────
  // `undefined` must mean "leave it alone" — a reportsTo-only update used
  // to reset scope to the role default, wipe scope entries AND clear the
  // manager. Those silent wipes are the "I saved and it vanished" class.

  describe("assignScopedMembership preserve semantics", () => {
    it("a reportsTo-only update preserves scopeType + scope entries", async () => {
      const { company, project, user } = await createTestFixture();
      const dept = await prisma.department.create({ data: { companyId: company.id, code: "OPS", name: "Ops" } });
      const target = await createUser("pres1", "Scoped Member", company.id, "HR_MANAGER");
      const mgr = await createUser("pres2", "Manager", company.id, "PROJECT_MANAGER");

      // Make the member DEPARTMENT-scoped with a scope row.
      await assignScopedMembership({
        actorUserId: user.id, userId: target.user.id, companyId: company.id,
        role: "HR_MANAGER", scopeType: "DEPARTMENT",
        scopeEntries: [{ departmentId: dept.id }],
      });

      // Now a reportsTo-only update — must not touch scope.
      await assignScopedMembership({
        actorUserId: user.id, userId: target.user.id, companyId: company.id,
        role: "HR_MANAGER",
        reportsToUserCompanyId: mgr.membership.id,
      });

      const after = await prisma.userCompany.findUniqueOrThrow({
        where: { id: target.membership.id },
        include: { scopes: true },
      });
      expect(after.scopeType).toBe("DEPARTMENT");
      expect(after.scopes).toHaveLength(1);
      expect(after.scopes[0]!.departmentId).toBe(dept.id);
      expect(after.reportsToUserCompanyId).toBe(mgr.membership.id);
    });

    it("a scope-only update preserves the existing reporting line", async () => {
      const { company, project, user } = await createTestFixture();
      const target = await createUser("pres3", "Member", company.id, "SUPERVISOR");
      const mgr = await createUser("pres4", "Manager", company.id, "PROJECT_MANAGER");

      await assignScopedMembership({
        actorUserId: user.id, userId: target.user.id, companyId: company.id,
        role: "SUPERVISOR", scopeType: "COMPANY",
        reportsToUserCompanyId: mgr.membership.id,
      });

      // Scope-only update — must not clear the manager.
      await assignScopedMembership({
        actorUserId: user.id, userId: target.user.id, companyId: company.id,
        role: "SUPERVISOR", scopeType: "PROJECT",
        scopeEntries: [{ projectId: project.id }],
      });

      const after = await prisma.userCompany.findUniqueOrThrow({ where: { id: target.membership.id } });
      expect(after.reportsToUserCompanyId).toBe(mgr.membership.id);
      expect(after.scopeType).toBe("PROJECT");
    });

    it("an explicit null reportsTo still clears the manager", async () => {
      const { company, user } = await createTestFixture();
      const target = await createUser("pres5", "Member", company.id, "SUPERVISOR");
      const mgr = await createUser("pres6", "Manager", company.id, "PROJECT_MANAGER");

      await assignScopedMembership({
        actorUserId: user.id, userId: target.user.id, companyId: company.id,
        role: "SUPERVISOR", scopeType: "COMPANY",
        reportsToUserCompanyId: mgr.membership.id,
      });
      await assignScopedMembership({
        actorUserId: user.id, userId: target.user.id, companyId: company.id,
        role: "SUPERVISOR", reportsToUserCompanyId: null,
      });

      const after = await prisma.userCompany.findUniqueOrThrow({ where: { id: target.membership.id } });
      expect(after.reportsToUserCompanyId).toBeNull();
    });
  });

  // ── assignScopedMembership: scope ceiling ─────────────────────
  // Nobody can grant visibility beyond their own scope — a dept-scoped
  // HR manager must not mint company-wide sight lines.

  describe("assignScopedMembership scope ceiling", () => {
    async function scopeActorToDept(membershipId: string, departmentId: string) {
      await prisma.userCompany.update({ where: { id: membershipId }, data: { scopeType: "DEPARTMENT" } });
      await prisma.userScope.create({
        data: { userCompanyId: membershipId, scopeKind: "DEPARTMENT", departmentId },
      });
    }

    it("a department-scoped actor cannot grant COMPANY scope", async () => {
      const { company } = await createTestFixture();
      const dept = await prisma.department.create({ data: { companyId: company.id, code: "HR", name: "HR" } });
      const actor = await createUser("hr-d", "Dept HR", company.id, "HR_MANAGER");
      await scopeActorToDept(actor.membership.id, dept.id);
      const target = await createUser("t-sc1", "Subordinate", company.id, "SUPERVISOR");

      await expect(
        assignScopedMembership({
          actorUserId: actor.user.id, userId: target.user.id, companyId: company.id,
          role: "SUPERVISOR", scopeType: "COMPANY",
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("a department-scoped actor cannot grant another department", async () => {
      const { company } = await createTestFixture();
      const own = await prisma.department.create({ data: { companyId: company.id, code: "HR", name: "HR" } });
      const other = await prisma.department.create({ data: { companyId: company.id, code: "FIN", name: "Finance" } });
      const actor = await createUser("hr-d2", "Dept HR", company.id, "HR_MANAGER");
      await scopeActorToDept(actor.membership.id, own.id);
      const target = await createUser("t-sc2", "Subordinate", company.id, "SUPERVISOR");

      await expect(
        assignScopedMembership({
          actorUserId: actor.user.id, userId: target.user.id, companyId: company.id,
          role: "SUPERVISOR", scopeType: "DEPARTMENT", scopeEntries: [{ departmentId: other.id }],
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("a department-scoped actor CAN grant their own department", async () => {
      const { company } = await createTestFixture();
      const own = await prisma.department.create({ data: { companyId: company.id, code: "HR", name: "HR" } });
      const actor = await createUser("hr-d3", "Dept HR", company.id, "HR_MANAGER");
      await scopeActorToDept(actor.membership.id, own.id);
      const target = await createUser("t-sc3", "Subordinate", company.id, "SUPERVISOR");

      const membership = await assignScopedMembership({
        actorUserId: actor.user.id, userId: target.user.id, companyId: company.id,
        role: "SUPERVISOR", scopeType: "DEPARTMENT", scopeEntries: [{ departmentId: own.id }],
      });
      expect(membership?.scopeType).toBe("DEPARTMENT");
    });

    it("a department-scoped actor can grant PROJECT scope only for projects their dept is deployed on", async () => {
      const { company, project } = await createTestFixture();
      const own = await prisma.department.create({ data: { companyId: company.id, code: "HR", name: "HR" } });
      const actor = await createUser("hr-d4", "Dept HR", company.id, "HR_MANAGER");
      await scopeActorToDept(actor.membership.id, own.id);
      const target = await createUser("t-sc4", "Subordinate", company.id, "SUPERVISOR");

      // Nobody in the dept is deployed on the project → grant must fail.
      await expect(
        assignScopedMembership({
          actorUserId: actor.user.id, userId: target.user.id, companyId: company.id,
          role: "SUPERVISOR", scopeType: "PROJECT", scopeEntries: [{ projectId: project.id }],
        }),
      ).rejects.toMatchObject({ status: 403 });

      // Deploy a dept employee on the project → the grant becomes legal.
      await prisma.employee.create({
        data: { companyId: company.id, name: "Dept Worker", departmentId: own.id, activeProjectId: project.id },
      });
      const membership = await assignScopedMembership({
        actorUserId: actor.user.id, userId: target.user.id, companyId: company.id,
        role: "SUPERVISOR", scopeType: "PROJECT", scopeEntries: [{ projectId: project.id }],
      });
      expect(membership?.scopeType).toBe("PROJECT");
    });

    it("a company-scoped actor can still grant any scope", async () => {
      const { company, project, user } = await createTestFixture(); // OWNER → company scope
      const target = await createUser("t-sc5", "Subordinate", company.id, "SUPERVISOR");

      const membership = await assignScopedMembership({
        actorUserId: user.id, userId: target.user.id, companyId: company.id,
        role: "SUPERVISOR", scopeType: "PROJECT", scopeEntries: [{ projectId: project.id }],
      });
      expect(membership?.scopeType).toBe("PROJECT");
    });
  });

  // ── updateEmployee: reporting-line integrity ──────────────────

  describe("updateEmployee reporting lines", () => {
    it("rejects self-reporting", async () => {
      const { company } = await createTestFixture();
      const emp = await prisma.employee.create({ data: { companyId: company.id, name: "Emp" } });

      await expect(
        updateEmployee({ employeeId: emp.id, companyId: company.id, reportsToEmployeeId: emp.id }),
      ).rejects.toMatchObject({ message: "An employee cannot report to themselves", status: 400 });
    });

    it("rejects a two-way employee reporting loop without writing it", async () => {
      const { company } = await createTestFixture();
      const a = await prisma.employee.create({ data: { companyId: company.id, name: "A" } });
      const b = await prisma.employee.create({ data: { companyId: company.id, name: "B" } });

      // A reports to B.
      await updateEmployee({ employeeId: a.id, companyId: company.id, reportsToEmployeeId: b.id });

      // B reports to A closes the loop — refused, and B's row must stay
      // clean (the old code validated AFTER writing, leaving the loop in).
      await expect(
        updateEmployee({ employeeId: b.id, companyId: company.id, reportsToEmployeeId: a.id }),
      ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("cycle") });

      const after = await prisma.employee.findUniqueOrThrow({ where: { id: b.id } });
      expect(after.reportsToEmployeeId).toBeNull();
    });
  });

  // ── resolveUserScope: custom roles inherit baseRole scope ─────

  describe("resolveUserScope baseRole inheritance", () => {
    it("a custom role based on SITE_ENGINEER resolves to PROJECT scope", async () => {
      const { company, project } = await createTestFixture();
      await prisma.customRole.create({
        data: { companyId: company.id, key: "CUSTOM_SITE_LEAD", label: "Site Lead", baseRole: "SITE_ENGINEER", tier: 4, permissions: [] },
      });
      const { membership } = await createUser("t5", "Site Lead", company.id, "CUSTOM_SITE_LEAD");
      await prisma.userScope.create({
        data: { userCompanyId: membership.id, scopeKind: "PROJECT", projectId: project.id },
      });

      const scope = await resolveUserScope("t5", company.id);

      // Before the fix, CUSTOM_* fell through to the COMPANY default and the
      // user could see every project in the company.
      expect(scope?.scopeType).toBe("PROJECT");
      expect(scope?.projectIds).toEqual([project.id]);
    });

    it("a built-in SITE_ENGINEER resolves to PROJECT scope (control)", async () => {
      const { company, project } = await createTestFixture();
      const { membership } = await createUser("t6", "Engineer", company.id, "SITE_ENGINEER");
      await prisma.userScope.create({
        data: { userCompanyId: membership.id, scopeKind: "PROJECT", projectId: project.id },
      });

      const scope = await resolveUserScope("t6", company.id);

      expect(scope?.scopeType).toBe("PROJECT");
      expect(scope?.projectIds).toEqual([project.id]);
    });

    it("OWNER always resolves to COMPANY scope", async () => {
      const { company, user } = await createTestFixture();
      const scope = await resolveUserScope(user.id, company.id);
      expect(scope?.scopeType).toBe("COMPANY");
    });
  });

  // ── issueMaterialsToProject: cross-tenant seal + requisition ownership ──

  describe("issueMaterialsToProject tenant scoping", () => {
    async function makeStock(companyId: string, locationId: string, qty = 100) {
      const category = await prisma.materialCategory.create({
        data: { companyId, name: "Test Category" },
      });
      const material = await prisma.material.create({
        data: { companyId, code: `MAT-${crypto.randomUUID().slice(0, 8)}`, name: "Test Material", unit: "KG", categoryId: category.id },
      });
      await prisma.stockLocationItem.create({
        data: { materialId: material.id, locationId, qty, movingAvgCost: 10 },
      });
      return material;
    }

    it("rejects a project from another company", async () => {
      const { company, stockLocation } = await createTestFixture();
      const foreign = await createForeignTenant();
      const mat = await makeStock(company.id, stockLocation.id);

      await expect(
        issueMaterialsToProject({
          projectId: foreign.project.id,
          fromLocationId: stockLocation.id,
          companyId: company.id,
          lines: [{ materialId: mat.id, qty: 1 }],
        }),
      ).rejects.toThrow("Project not found or deleted");
    });

    it("rejects a requisition belonging to a different project", async () => {
      const { company, project, stockLocation, user } = await createTestFixture();
      const other = await prisma.project.create({
        data: { companyId: company.id, name: "Other Project", status: "ACTIVE" },
      });
      const req = await prisma.materialRequisition.create({
        data: { reqNumber: `REQ-${crypto.randomUUID().slice(0, 8)}`, projectId: other.id, requestedById: user.id, status: "APPROVED" },
      });
      const mat = await makeStock(company.id, stockLocation.id);

      await expect(
        issueMaterialsToProject({
          projectId: project.id,
          fromLocationId: stockLocation.id,
          companyId: company.id,
          requisitionId: req.id,
          lines: [{ materialId: mat.id, qty: 1 }],
        }),
      ).rejects.toThrow("Requisition does not belong to this project");
    });

    it("rejects a foreign-company requisition", async () => {
      const { company, project, stockLocation, user } = await createTestFixture();
      const foreign = await createForeignTenant();
      const fUser = await prisma.user.create({
        data: { id: `fu-${crypto.randomUUID().slice(0, 8)}`, email: `${crypto.randomUUID().slice(0, 8)}@t.in`, name: "FU", role: "OWNER", companyId: foreign.company.id },
      });
      const req = await prisma.materialRequisition.create({
        data: { reqNumber: `REQ-F-${crypto.randomUUID().slice(0, 8)}`, projectId: foreign.project.id, requestedById: fUser.id, status: "APPROVED" },
      });
      const mat = await makeStock(company.id, stockLocation.id);

      await expect(
        issueMaterialsToProject({
          projectId: project.id,
          fromLocationId: stockLocation.id,
          companyId: company.id,
          requisitionId: req.id,
          lines: [{ materialId: mat.id, qty: 1 }],
        }),
      ).rejects.toThrow("Requisition does not belong to this project");
    });

    it("issues successfully against a valid same-project requisition", async () => {
      const { company, project, stockLocation, user } = await createTestFixture();
      await seedTestAccounts(company.id); // GL posting needs the chart of accounts
      const req = await prisma.materialRequisition.create({
        data: { reqNumber: `REQ-OK-${crypto.randomUUID().slice(0, 8)}`, projectId: project.id, requestedById: user.id, status: "APPROVED" },
      });
      const mat = await makeStock(company.id, stockLocation.id);

      const { materialIssue } = await issueMaterialsToProject({
        projectId: project.id,
        fromLocationId: stockLocation.id,
        companyId: company.id,
        requisitionId: req.id,
        lines: [{ materialId: mat.id, qty: 1 }],
      });

      expect(materialIssue.requisitionId).toBe(req.id);
    });
  });

  // ── createNcr: tenant-scoped project lookup ───────────────────

  describe("createNcr tenant scoping", () => {
    it("rejects a project from another company and writes nothing there", async () => {
      const { company } = await createTestFixture();
      const foreign = await createForeignTenant();

      await expect(
        createNcr({
          companyId: company.id,
          projectId: foreign.project.id,
          title: "Leak test",
          description: "Must not be created in the foreign tenant",
        }),
      ).rejects.toMatchObject({ message: "Project not found" });

      const leaked = await prisma.nonConformanceReport.count({
        where: { companyId: foreign.company.id },
      });
      expect(leaked).toBe(0);
    });

    it("creates the NCR in the caller's company for a valid project", async () => {
      const { company, project, user } = await createTestFixture();

      const ncr = await createNcr({
        companyId: company.id,
        projectId: project.id,
        title: "Concrete honeycombing",
        description: "Slab pour defect",
        userId: user.id,
      });

      expect(ncr.companyId).toBe(company.id);
      expect(ncr.projectId).toBe(project.id);
    });
  });
});
