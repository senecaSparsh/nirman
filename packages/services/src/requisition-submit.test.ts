/**
 * submitRequisition guards — an indent with zero lines must never reach the
 * approval queue. Drafts can be emptied via PATCH updates or created through
 * paths that bypass the API schema's lines.min(1).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@nirman/db";
import { approveRequisition, submitRequisition } from "./requisition";
import { withSerializableTransaction } from "./transaction";

vi.mock("./transaction", async importOriginal => ({
  ...await importOriginal<typeof import("./transaction")>(), withSerializableTransaction: vi.fn(),
}));
vi.mock("./audit", () => ({ logAction: vi.fn() }));
vi.mock("./procurement-routing", () => ({
  evaluateRequisitionRouting: vi.fn().mockResolvedValue(undefined),
  getCachedRoutingScope: vi.fn(),
}));
vi.mock("./notification-event-bus", () => ({
  emitNotificationEvent: vi.fn(),
  NotificationEventType: {
    REQUISITION_SUBMITTED: "REQUISITION_SUBMITTED",
    REQUISITION_APPROVED: "REQUISITION_APPROVED",
  },
}));

const tx = {
  materialRequisition: { findUnique: vi.fn(), update: vi.fn() },
};

function draftWithLines(lines: number) {
  return {
    id: "qa-indent",
    status: "DRAFT" as const,
    project: { companyId: "qa-company" },
    department: null,
    _count: { lines },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(withSerializableTransaction).mockImplementation(
    async fn => fn(tx as unknown as Prisma.TransactionClient),
  );
});

describe("submitRequisition", () => {
  it("refuses to submit an indent with no line items", async () => {
    tx.materialRequisition.findUnique.mockResolvedValue(draftWithLines(0));
    await expect(submitRequisition("qa-indent", "qa-user")).rejects.toThrow(
      "Cannot submit an indent with no line items",
    );
    expect(tx.materialRequisition.update).not.toHaveBeenCalled();
  });

  it("submits a draft that has lines", async () => {
    tx.materialRequisition.findUnique.mockResolvedValue(draftWithLines(2));
    tx.materialRequisition.update.mockResolvedValue({ id: "qa-indent", status: "SUBMITTED" });
    await expect(submitRequisition("qa-indent", "qa-user")).resolves.toBeDefined();
    expect(tx.materialRequisition.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUBMITTED" }) }),
    );
  });

  it("still refuses non-DRAFT statuses", async () => {
    tx.materialRequisition.findUnique.mockResolvedValue({ ...draftWithLines(2), status: "APPROVED" });
    await expect(submitRequisition("qa-indent")).rejects.toThrow("Cannot submit indent in status APPROVED");
  });
});

describe("approveRequisition", () => {
  it("refuses to approve a zero-line indent (legacy SUBMITTED rows)", async () => {
    tx.materialRequisition.findUnique.mockResolvedValue({ ...draftWithLines(0), status: "SUBMITTED" });
    await expect(approveRequisition("qa-indent", "qa-approver")).rejects.toThrow(
      "Indent has no material lines — add lines before approving",
    );
    expect(tx.materialRequisition.update).not.toHaveBeenCalled();
  });
});
