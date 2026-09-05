import { test, expect, expectNoCrash } from "../fixtures";
import { testData, TEST_PREFIX } from "../helpers/test-data";

/**
 * @flow People/HR — attendance → DPR → payroll.
 *
 * Tests the HR pipeline:
 *  - Record attendance (POST /api/attendance)
 *  - Submit a DPR (POST /api/dprs)
 *  - Generate payroll (POST /api/payroll)
 *  - Verify the HR pages render with data
 *  - RBAC: SUPERVISOR can submit DPRs, SALES_MANAGER cannot
 */

// Known dev DB IDs.
const EMPLOYEE_ID = "cmtjqomek000kvlb1vvo53l75"; // Suresh Kale
const HILLVIEW_PROJECT = "cmtjqomev0010vlb14a93wkxc";

test.describe("@flow HR: attendance → DPR → payroll", () => {
  test("record attendance for an employee", async ({ api, page }) => {
    const ctx = await api("OWNER");
    const data = await testData();
    const project = data.projects.find((p: any) => p.id === HILLVIEW_PROJECT) ?? data.project;
    const today = new Date().toISOString().split("T")[0];

    const r = await ctx.post("/api/attendance", {
      data: {
        employeeId: EMPLOYEE_ID,
        date: today,
        projectId: project.id,
        status: "PRESENT",
        checkIn: "09:00",
        checkOut: "18:00",
        hoursWorked: 9,
        notes: `${TEST_PREFIX} attendance`,
      },
    });
    expect(r.status(), "record attendance").toBeLessThan(300);
    const att = await r.json();
    expect(att.id ?? att.ok).toBeTruthy();

    // Verify the attendance page renders.
    await page.goto("/hr/attendance", { waitUntil: "domcontentloaded" });
    await expectNoCrash(page);

    await ctx.dispose();
  });

  test("submit a DPR (daily progress report)", async ({ api, page }) => {
    const ctx = await api("OWNER");
    const data = await testData();
    const project = data.projects.find((p: any) => p.id === HILLVIEW_PROJECT) ?? data.project;
    const today = new Date().toISOString().split("T")[0];

    const r = await ctx.post("/api/dprs", {
      data: {
        projectId: project.id,
        date: today,
        workSummary: `${TEST_PREFIX} DPR — foundation work completed`,
        weather: "Sunny",
        progressPct: 25,
        materialLines: [
          {
            materialId: data.material.id,
            qty: 5,
            unitCost: 100,
          },
        ],
      },
    });
    expect(r.status(), "submit DPR").toBeLessThan(300);
    const dpr = await r.json();
    expect(dpr.id ?? dpr.ok).toBeTruthy();

    // Verify the DPR page renders.
    await page.goto("/hr/dprs", { waitUntil: "domcontentloaded" });
    await expectNoCrash(page);

    await ctx.dispose();
  });

  test("generate payroll for current month", async ({ api }) => {
    const ctx = await api("OWNER");
    const now = new Date();
    const r = await ctx.post("/api/payroll", {
      data: {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      },
    });
    // Payroll may return 201 (created) or 409 (already generated).
    expect(r.status(), "generate payroll").toBeLessThan(400);

    await ctx.dispose();
  });

  test("attendance validation requires employee and date", async ({ api }) => {
    const ctx = await api("OWNER");
    const r = await ctx.post("/api/attendance", {
      data: {
        employeeId: "",
        date: "",
        status: "PRESENT",
      },
    });
    expect(r.status()).toBe(400);
    await ctx.dispose();
  });

  test("DPR validation requires work summary", async ({ api }) => {
    const ctx = await api("OWNER");
    const data = await testData();
    const r = await ctx.post("/api/dprs", {
      data: {
        projectId: data.project.id,
        date: new Date().toISOString().split("T")[0],
        workSummary: "", // empty — should fail
      },
    });
    expect(r.status()).toBe(400);
    await ctx.dispose();
  });

  test("SALES_MANAGER cannot record attendance", async ({ api }) => {
    const ctx = await api("SALES_MANAGER");
    const r = await ctx.post("/api/attendance", {
      data: {
        employeeId: EMPLOYEE_ID,
        date: new Date().toISOString().split("T")[0],
        status: "PRESENT",
      },
    });
    expect(r.status()).toBe(403);
    await ctx.dispose();
  });

  test("employees list returns data", async ({ api }) => {
    const ctx = await api("OWNER");
    const r = await ctx.get("/api/employees");
    expect(r.status()).toBe(200);
    const data = await r.json();
    const list = Array.isArray(data) ? data : data.rows ?? data.items ?? [];
    expect(list.length, "should have employees").toBeGreaterThan(0);
    await ctx.dispose();
  });
});
