/**
 * Unit tests for the pure notification event bus helpers.
 *
 *   shouldRoleReceiveEvent — check if a role should receive an event type
 *   renderEventMessage     — render a basic message from event variables
 */
import { describe, it, expect } from "vitest";
import { shouldRoleReceiveEvent, renderEventMessage, NotificationEventType } from "./notification-event-bus";

describe("shouldRoleReceiveEvent", () => {
  it("OWNER receives all events", () => {
    expect(shouldRoleReceiveEvent("OWNER", NotificationEventType.SALE_CREATED)).toBe(true);
    expect(shouldRoleReceiveEvent("OWNER", NotificationEventType.NCR_RAISED)).toBe(true);
    expect(shouldRoleReceiveEvent("OWNER", NotificationEventType.DPR_SUBMITTED)).toBe(true);
  });

  it("ADMIN receives all events", () => {
    expect(shouldRoleReceiveEvent("ADMIN", NotificationEventType.SALE_CREATED)).toBe(true);
    expect(shouldRoleReceiveEvent("ADMIN", NotificationEventType.NCR_RAISED)).toBe(true);
  });

  it("PROJECT_DIRECTOR receives procurement and DPR events", () => {
    expect(shouldRoleReceiveEvent("PROJECT_DIRECTOR", NotificationEventType.REQUISITION_SUBMITTED)).toBe(true);
    expect(shouldRoleReceiveEvent("PROJECT_DIRECTOR", NotificationEventType.DPR_SUBMITTED)).toBe(true);
    expect(shouldRoleReceiveEvent("PROJECT_DIRECTOR", NotificationEventType.EXPENSE_CREATED)).toBe(true);
    expect(shouldRoleReceiveEvent("PROJECT_DIRECTOR", NotificationEventType.LAND_PURCHASE_CREATED)).toBe(true);
    expect(shouldRoleReceiveEvent("PROJECT_DIRECTOR", NotificationEventType.EQUIPMENT_MAINTENANCE_DUE)).toBe(true);
    expect(shouldRoleReceiveEvent("PROJECT_DIRECTOR", NotificationEventType.NCR_RAISED)).toBe(true);
  });

  it("PROJECT_DIRECTOR does not receive sales events", () => {
    expect(shouldRoleReceiveEvent("PROJECT_DIRECTOR", NotificationEventType.SALE_CREATED)).toBe(false);
    expect(shouldRoleReceiveEvent("PROJECT_DIRECTOR", NotificationEventType.UNIT_LISTING_SYNCED)).toBe(false);
  });

  it("SALES_MANAGER receives sales and land events", () => {
    expect(shouldRoleReceiveEvent("SALES_MANAGER", NotificationEventType.SALE_CREATED)).toBe(true);
    expect(shouldRoleReceiveEvent("SALES_MANAGER", NotificationEventType.SALE_PAYMENT_RECEIVED)).toBe(true);
    expect(shouldRoleReceiveEvent("SALES_MANAGER", NotificationEventType.TENANCY_CREATED)).toBe(true);
    expect(shouldRoleReceiveEvent("SALES_MANAGER", NotificationEventType.LEASE_EXPIRY_WARNING)).toBe(true);
  });

  it("SALES_MANAGER does not receive procurement or DPR events", () => {
    expect(shouldRoleReceiveEvent("SALES_MANAGER", NotificationEventType.REQUISITION_SUBMITTED)).toBe(false);
    expect(shouldRoleReceiveEvent("SALES_MANAGER", NotificationEventType.DPR_SUBMITTED)).toBe(false);
  });

  it("STORE_KEEPER receives procurement, equipment, inventory and gate-pass events", () => {
    expect(shouldRoleReceiveEvent("STORE_KEEPER", NotificationEventType.GOODS_RECEIVED)).toBe(true);
    expect(shouldRoleReceiveEvent("STORE_KEEPER", NotificationEventType.LOW_STOCK_ALERT)).toBe(true);
    expect(shouldRoleReceiveEvent("STORE_KEEPER", NotificationEventType.EQUIPMENT_ASSIGNED)).toBe(true);
    expect(shouldRoleReceiveEvent("STORE_KEEPER", NotificationEventType.STOCK_TRANSFER_CREATED)).toBe(true);
    expect(shouldRoleReceiveEvent("STORE_KEEPER", NotificationEventType.STOCK_ISSUE_CREATED)).toBe(true);
    expect(shouldRoleReceiveEvent("STORE_KEEPER", NotificationEventType.GATE_PASS_SUBMITTED)).toBe(true);
    expect(shouldRoleReceiveEvent("STORE_KEEPER", NotificationEventType.GATE_PASS_APPROVED)).toBe(true);
  });

  it("STORE_KEEPER does not receive sales or DPR events", () => {
    expect(shouldRoleReceiveEvent("STORE_KEEPER", NotificationEventType.SALE_CREATED)).toBe(false);
    expect(shouldRoleReceiveEvent("STORE_KEEPER", NotificationEventType.DPR_SUBMITTED)).toBe(false);
  });

  it("ACCOUNTANT receives finance, sales, land, and equipment events", () => {
    expect(shouldRoleReceiveEvent("ACCOUNTANT", NotificationEventType.EXPENSE_CREATED)).toBe(true);
    expect(shouldRoleReceiveEvent("ACCOUNTANT", NotificationEventType.SALE_PAYMENT_RECEIVED)).toBe(true);
    expect(shouldRoleReceiveEvent("ACCOUNTANT", NotificationEventType.LAND_PAYMENT_DUE)).toBe(true);
    expect(shouldRoleReceiveEvent("ACCOUNTANT", NotificationEventType.EQUIPMENT_MAINTENANCE_DUE)).toBe(true);
  });

  it("QAQC_ENGINEER receives quality and DPR events", () => {
    expect(shouldRoleReceiveEvent("QAQC_ENGINEER", NotificationEventType.NCR_RAISED)).toBe(true);
    expect(shouldRoleReceiveEvent("QAQC_ENGINEER", NotificationEventType.CAPA_DUE)).toBe(true);
    expect(shouldRoleReceiveEvent("QAQC_ENGINEER", NotificationEventType.DPR_SUBMITTED)).toBe(true);
  });

  it("SITE_ENGINEER receives inventory and gate-pass events", () => {
    expect(shouldRoleReceiveEvent("SITE_ENGINEER", NotificationEventType.STOCK_COUNT_DUE)).toBe(true);
    expect(shouldRoleReceiveEvent("SITE_ENGINEER", NotificationEventType.SCRAP_GENERATED)).toBe(true);
    expect(shouldRoleReceiveEvent("SITE_ENGINEER", NotificationEventType.GATE_PASS_EXITED)).toBe(true);
  });

  it("ACCOUNTANT receives inventory events but not gate-pass events", () => {
    expect(shouldRoleReceiveEvent("ACCOUNTANT", NotificationEventType.MATERIAL_PRICE_CHANGE)).toBe(true);
    expect(shouldRoleReceiveEvent("ACCOUNTANT", NotificationEventType.SCRAP_GENERATED)).toBe(true);
    expect(shouldRoleReceiveEvent("ACCOUNTANT", NotificationEventType.GATE_PASS_SUBMITTED)).toBe(false);
  });

  it("DEVELOPER receives all events", () => {
    expect(shouldRoleReceiveEvent("DEVELOPER", NotificationEventType.SALE_CREATED)).toBe(true);
    expect(shouldRoleReceiveEvent("DEVELOPER", NotificationEventType.GATE_PASS_SUBMITTED)).toBe(true);
  });

  it("unknown role receives nothing", () => {
    expect(shouldRoleReceiveEvent("UNKNOWN_ROLE", NotificationEventType.SALE_CREATED)).toBe(false);
    expect(shouldRoleReceiveEvent("UNKNOWN_ROLE", NotificationEventType.NCR_RAISED)).toBe(false);
  });
});

describe("renderEventMessage", () => {
  it("renders a human-readable message with variables interpolated", () => {
    const event = {
      eventType: NotificationEventType.SALE_CREATED,
      companyId: "c1",
      variables: { saleNumber: "S-001", salePrice: "5000000.00" },
      timestamp: new Date(),
    };
    const msg = renderEventMessage(event);
    // Human-readable — no raw "SALE_CREATED: key=value" debug format.
    expect(msg).toContain("Sale S-001");
    expect(msg).toContain("₹5000000.00");
    expect(msg).not.toContain("SALE_CREATED:");
    expect(msg).not.toContain("=");
  });

  it("handles empty variables gracefully", () => {
    const event = {
      eventType: NotificationEventType.DPR_SUBMITTED,
      companyId: "c1",
      variables: {},
      timestamp: new Date(),
    };
    const msg = renderEventMessage(event);
    expect(msg).toContain("Daily report");
    expect(msg).not.toContain("DPR_SUBMITTED:");
  });

  it("falls back to humanized type + readable vars for unmapped events", () => {
    const event = {
      eventType: "SOME_UNKNOWN_EVENT" as NotificationEventType,
      companyId: "c1",
      variables: { reqNo: "REQ-001", approver: "John" },
      timestamp: new Date(),
    };
    const msg = renderEventMessage(event);
    expect(msg).toContain("Some Unknown Event");
    expect(msg).toContain("reqNo=REQ-001");
  });

  it("renders rejection reason when provided", () => {
    const event = {
      eventType: NotificationEventType.DPR_REJECTED,
      companyId: "c1",
      variables: { dprId: "d1", reason: "Missing photos" },
      timestamp: new Date(),
    };
    const msg = renderEventMessage(event);
    expect(msg).toContain("rejected");
    expect(msg).toContain("Missing photos");
  });
});
