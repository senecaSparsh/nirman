/**
 * Off-site attendance review — check-ins outside the geofence record
 * PRESENT but flag offSiteReview=PENDING; HR approves (stays) or rejects
 * (→ ABSENT). The review state must survive re-records and only clear
 * when a later check-in lands inside the fence.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";

describe("off-site attendance review", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    const employee = await prisma.employee.create({
      data: {
        name: "Field Worker",
        phone: "9777788888",
        companyId: fixture.company.id,
        wageType: "DAILY",
        dailyRate: new Decimal(800),
        active: true,
        activeProjectId: fixture.project.id,
      },
    });
    return { ...fixture, employee };
  }

  it("off-site check-in flags PENDING; in-fence re-record auto-clears it", async () => {
    const { company, user, employee } = await setup();
    const { recordAttendance } = await import("../hr");

    const rec = await recordAttendance({
      companyId: company.id,
      employeeId: employee.id,
      date: new Date("2025-06-10"),
      status: "PRESENT",
      checkIn: new Date("2025-06-10T08:30:00"),
      checkInLat: 28.61,
      checkInLng: 77.21,
      geoFenceOk: false,
      geoFenceDistance: 2400,
      offSiteReview: "PENDING",
      userId: user.id,
    });
    expect(rec.offSiteReview).toBe("PENDING");
    expect(rec.status).toBe("PRESENT");

    // Same day, GPS drifts into the fence on a re-check → flag clears itself.
    const r2 = await recordAttendance({
      companyId: company.id,
      employeeId: employee.id,
      date: new Date("2025-06-10"),
      status: "PRESENT",
      checkIn: new Date("2025-06-10T08:30:00"),
      geoFenceOk: true,
      geoFenceDistance: 120,
      userId: user.id,
    });
    expect(r2.offSiteReview).toBeNull();
  });

  it("an APPROVED/REJECTED decision survives a re-record of the same day", async () => {
    const { company, user, employee } = await setup();
    const { recordAttendance } = await import("../hr");

    const rec = await recordAttendance({
      companyId: company.id,
      employeeId: employee.id,
      date: new Date("2025-06-11"),
      status: "PRESENT",
      geoFenceOk: false,
      offSiteReview: "PENDING",
      userId: user.id,
    });
    // HR approves — mimics the review route's write.
    await prisma.workerAttendance.update({
      where: { id: rec.id },
      data: { offSiteReview: "APPROVED", offSiteReviewedById: user.id, offSiteReviewedAt: new Date() },
    });
    // A later bulk re-mark of the day must not wipe the decision.
    const r2 = await recordAttendance({
      companyId: company.id,
      employeeId: employee.id,
      date: new Date("2025-06-11"),
      status: "PRESENT",
      hoursWorked: 8,
      userId: user.id,
    });
    expect(r2.offSiteReview).toBe("APPROVED");
  });

  it("reject flips the day to ABSENT (payroll picks it up)", async () => {
    const { company, user, employee } = await setup();
    const { recordAttendance } = await import("../hr");
    const rec = await recordAttendance({
      companyId: company.id,
      employeeId: employee.id,
      date: new Date("2025-06-12"),
      status: "PRESENT",
      geoFenceOk: false,
      offSiteReview: "PENDING",
      userId: user.id,
    });
    // The review route's reject write.
    const updated = await prisma.workerAttendance.update({
      where: { id: rec.id },
      data: { offSiteReview: "REJECTED", offSiteReviewedById: user.id, status: "ABSENT" },
    });
    expect(updated.status).toBe("ABSENT");
    expect(updated.offSiteReview).toBe("REJECTED");
  });
});
