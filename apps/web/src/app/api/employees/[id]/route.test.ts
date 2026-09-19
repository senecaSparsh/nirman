import { describe, it, expect, beforeEach, vi } from "vitest";
import { authMocks, setSessionUser, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";

vi.mock("@/lib/auth", () => authMocks.authFactory());
vi.mock("@nirman/db", () => authMocks.dbFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

const { updateEmployeeMock, updateEmployeeDossierMock, autoCompleteOnboardingMock } = vi.hoisted(() => ({
  updateEmployeeMock: vi.fn(),
  updateEmployeeDossierMock: vi.fn(),
  autoCompleteOnboardingMock: vi.fn(),
}));

vi.mock("@nirman/services", async () => {
  const actual = await vi.importActual("@nirman/services");
  return {
    ...actual,
    updateEmployee: updateEmployeeMock,
    updateEmployeeDossier: updateEmployeeDossierMock,
    autoCompleteOnboarding: autoCompleteOnboardingMock,
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});
vi.spyOn(console, "error").mockImplementation(() => {});

import { PATCH } from "./route";

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

/**
 * Regression tests for the "absent vs null" contract on PATCH:
 *  - key absent from the body → service receives `undefined` → field untouched
 *  - key present as null      → service receives `null` → field cleared
 * Previously `parsed.data.x ?? null` / `?? undefined` collapsed these, so an
 * unrelated save (e.g. PAN number) wiped monthlySalary, and explicit clears
 * (reports-to, department, wage) were silently ignored.
 */
describe("PATCH /api/employees/[id]", () => {
  beforeEach(() => {
    setSessionUser({ role: "OWNER" });
    updateEmployeeMock.mockReset().mockResolvedValue({ id: "emp-1" });
    updateEmployeeDossierMock.mockReset().mockResolvedValue({});
    autoCompleteOnboardingMock.mockReset().mockResolvedValue(undefined);
    // Employee exists with no linked user → canManageSpecificEmployee passes early.
    mockPrisma().employee!.findFirst.mockResolvedValue({
      id: "emp-1",
      userId: null,
      reportsToEmployeeId: null,
      hierarchyLevel: null,
      user: null,
    });
  });

  it("does NOT wipe wage fields when the PATCH omits them (dossier-only save)", async () => {
    const res = await PATCH(
      makeRequest("/api/employees/emp-1", { method: "PATCH", body: { panNumber: "ABCDE1234F" } }),
      makeCtx("emp-1"),
    );
    expect(res.status).toBe(200);
    const input = updateEmployeeMock.mock.calls[0]?.[0];
    expect(input.monthlySalary).toBeUndefined();
    expect(input.dailyRate).toBeUndefined();
    // The dossier field still reaches updateEmployeeDossier.
    expect(updateEmployeeDossierMock).toHaveBeenCalledWith(
      "emp-1",
      "company-1",
      expect.any(String),
      { panNumber: "ABCDE1234F" },
    );
  });

  it("does NOT wipe wage fields on a checklist-only PATCH", async () => {
    const res = await PATCH(
      makeRequest("/api/employees/emp-1", { method: "PATCH", body: { documentsSubmitted: true } }),
      makeCtx("emp-1"),
    );
    expect(res.status).toBe(200);
    const input = updateEmployeeMock.mock.calls[0]?.[0];
    expect(input.monthlySalary).toBeUndefined();
    expect(input.dailyRate).toBeUndefined();
  });

  it("clears monthlySalary when the body sends explicit null", async () => {
    const res = await PATCH(
      makeRequest("/api/employees/emp-1", { method: "PATCH", body: { monthlySalary: null } }),
      makeCtx("emp-1"),
    );
    expect(res.status).toBe(200);
    expect(updateEmployeeMock.mock.calls[0]?.[0].monthlySalary).toBeNull();
  });

  it("clears dailyRate when the body sends explicit null (service maps null → 0)", async () => {
    const res = await PATCH(
      makeRequest("/api/employees/emp-1", { method: "PATCH", body: { dailyRate: null } }),
      makeCtx("emp-1"),
    );
    expect(res.status).toBe(200);
    expect(updateEmployeeMock.mock.calls[0]?.[0].dailyRate).toBeNull();
  });

  it("clears the reporting line on explicit null reportsToEmployeeId", async () => {
    const res = await PATCH(
      makeRequest("/api/employees/emp-1", { method: "PATCH", body: { reportsToEmployeeId: null } }),
      makeCtx("emp-1"),
    );
    expect(res.status).toBe(200);
    expect(updateEmployeeMock.mock.calls[0]?.[0].reportsToEmployeeId).toBeNull();
  });

  it("clears departmentId on explicit null", async () => {
    const res = await PATCH(
      makeRequest("/api/employees/emp-1", { method: "PATCH", body: { departmentId: null } }),
      makeCtx("emp-1"),
    );
    expect(res.status).toBe(200);
    expect(updateEmployeeMock.mock.calls[0]?.[0].departmentId).toBeNull();
  });

  it("clears hierarchyLevel on explicit null", async () => {
    const res = await PATCH(
      makeRequest("/api/employees/emp-1", { method: "PATCH", body: { hierarchyLevel: null } }),
      makeCtx("emp-1"),
    );
    expect(res.status).toBe(200);
    expect(updateEmployeeMock.mock.calls[0]?.[0].hierarchyLevel).toBeNull();
  });

  it("updates wage fields normally when provided", async () => {
    const res = await PATCH(
      makeRequest("/api/employees/emp-1", {
        method: "PATCH",
        body: { wageType: "MONTHLY", monthlySalary: 48000, dailyRate: null },
      }),
      makeCtx("emp-1"),
    );
    expect(res.status).toBe(200);
    const input = updateEmployeeMock.mock.calls[0]?.[0];
    expect(input.wageType).toBe("MONTHLY");
    expect(input.monthlySalary).toBe(48000);
    expect(input.dailyRate).toBeNull();
  });

  it("returns 404 when the employee does not exist", async () => {
    mockPrisma().employee!.findFirst.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest("/api/employees/nope", { method: "PATCH", body: { name: "X" } }),
      makeCtx("nope"),
    );
    expect(res.status).toBe(404);
  });
});
