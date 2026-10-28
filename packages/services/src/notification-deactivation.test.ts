import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  userCompany: { findMany: vi.fn() },
  notificationPreference: { findMany: vi.fn() },
  inAppNotification: { create: vi.fn(), findFirst: vi.fn() },
  notificationLog: { create: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  notificationTemplate: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  pushSubscription: { findMany: vi.fn(), update: vi.fn() },
}));

vi.mock("@nirman/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nirman/db")>()),
  prisma: db,
}));

import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";
import { sendPushToUser } from "./push";
import { processPendingNotifications } from "./notification-handlers";
import { sendNotification } from "./notifications";

vi.mock("./notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./notifications")>()),
  sendNotification: vi.fn().mockResolvedValue({ success: true }),
  createInAppNotification: vi.fn().mockResolvedValue({}),
}));

// A live member and a member terminated from this company — their USER
// account stays active (they belong to another company), which is exactly
// the case the old user.active-only filter missed.
const LIVE = {
  userId: "u-live", role: "STORE_KEEPER", active: true,
  activeRole: null, secondaryRoles: [], scopeType: null, scopes: [],
  user: { id: "u-live", active: true },
};
const GONE = {
  ...LIVE,
  userId: "u-gone", active: false,
  user: { id: "u-gone", active: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  const all = [LIVE, GONE];
  // Simulate the DB honoring the where — an active:true filter drops dead rows.
  db.userCompany.findMany.mockImplementation(async ({ where }: any) =>
    all.filter((m) => (where?.active === true ? m.active !== false : true)),
  );
  db.notificationPreference.findMany.mockResolvedValue([]);
  db.inAppNotification.create.mockResolvedValue({});
  db.notificationLog.create.mockResolvedValue({});
  db.pushSubscription.findMany.mockResolvedValue([]);
});

describe("notification recipients after termination", () => {
  it("role-resolved recipients exclude a deactivated membership", async () => {
    await emitNotificationEvent({
      eventType: NotificationEventType.STOCK_ISSUE_CREATED,
      companyId: "co-1",
      variables: {},
      timestamp: new Date(),
    });
    const bellIds = db.inAppNotification.create.mock.calls.map((c: any) => c[0]?.data?.userId);
    expect(bellIds).toContain("u-live");
    expect(bellIds).not.toContain("u-gone");
  });

  it("a direct push only reaches subscriptions of an active account", async () => {
    await sendPushToUser("u-gone", { title: "t", body: "b" });
    expect(db.pushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user: { active: true } }),
      }),
    );
  });
});

describe("processPendingNotifications — queued sends", () => {
  const pendingLog = (recipient: string) => ({
    id: `log-${recipient}`,
    companyId: "co-1",
    recipient,
    userId: recipient,
    eventType: "STOCK_ISSUE_CREATED",
    message: "Stock issued",
    status: "PENDING",
    createdAt: new Date(),
    metadata: { channels: ["WHATSAPP"], urgency: "IMMEDIATE" },
  });

  beforeEach(() => {
    db.notificationTemplate.findMany.mockResolvedValue([]);
    db.notificationLog.update.mockResolvedValue({});
    // Claims always succeed in these tests — each pending row is flushable.
    db.notificationLog.updateMany.mockResolvedValue({ count: 1 });
  });

  it("flushes a queued send to a live member", async () => {
    db.notificationLog.findMany.mockResolvedValue([pendingLog("u-live")]);
    db.user.findMany.mockResolvedValue([{ id: "u-live", phone: "9876500000", email: "l@x.in", name: "Live", active: true }]);
    db.userCompany.findMany.mockResolvedValue([{ userId: "u-live", companyId: "co-1", active: true }]);
    const out = await processPendingNotifications();
    expect(sendNotification).toHaveBeenCalled();
    expect(out.sent).toBe(1);
  });

  it("does not flush a queued send to a deactivated account", async () => {
    db.notificationLog.findMany.mockResolvedValue([pendingLog("u-gone")]);
    db.user.findMany.mockResolvedValue([{ id: "u-gone", phone: "9876500001", email: "g@x.in", name: "Gone", active: false }]);
    db.userCompany.findMany.mockResolvedValue([]);
    const out = await processPendingNotifications();
    expect(sendNotification).not.toHaveBeenCalled();
    expect(out.sent).toBe(0);
  });

  it("does not flush a queued send to a member terminated from the log's company", async () => {
    // The account is still live in another company — what died is the
    // co-1 membership, which is what the notification belongs to. The live-
    // membership query (active: true) returns nothing for them.
    db.notificationLog.findMany.mockResolvedValue([pendingLog("u-gone")]);
    db.user.findMany.mockResolvedValue([{ id: "u-gone", phone: "9876500001", email: "g@x.in", name: "Gone", active: true }]);
    db.userCompany.findMany.mockResolvedValue([]);
    const out = await processPendingNotifications();
    expect(sendNotification).not.toHaveBeenCalled();
    expect(out.sent).toBe(0);
  });
});
