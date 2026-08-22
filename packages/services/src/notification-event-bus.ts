/**
 * Notification Event Bus — centralized event-driven notification system.
 *
 * 27 event types across 5 workflows (procurement, sales, inventory,
 * HR/DPR, finance). Events are emitted by service functions and
 * dispatched to notification handlers that send WhatsApp/email/in-app
 * messages based on user preferences.
 *
 * Smart batching: notifications within a 5-minute window for the same
 * user+event type are batched into a single message. Urgency levels
 * (IMMEDIATE/DAILY/WEEKLY) control delivery timing. Quiet hours
 * suppress non-IMMEDIATE notifications.
 */

import { prisma } from "@nirman/db";

/** 27 event types across 5 workflows */
export enum NotificationEventType {
  // Procurement (9)
  REQUISITION_SUBMITTED = "REQUISITION_SUBMITTED",
  REQUISITION_APPROVED = "REQUISITION_APPROVED",
  REQUISITION_REJECTED = "REQUISITION_REJECTED",
  REQUISITION_CONVERTED_TO_PO = "REQUISITION_CONVERTED_TO_PO",
  PO_APPROVED = "PO_APPROVED",
  PO_ORDERED = "PO_ORDERED",
  GOODS_RECEIVED = "GOODS_RECEIVED",
  SUPPLIER_PAYMENT_DUE = "SUPPLIER_PAYMENT_DUE",
  LOW_STOCK_ALERT = "LOW_STOCK_ALERT",

  // Sales (5)
  SALE_CREATED = "SALE_CREATED",
  SALE_PAYMENT_RECEIVED = "SALE_PAYMENT_RECEIVED",
  SALE_CANCELLED = "SALE_CANCELLED",
  CUSTOMER_DEPOSIT_RECEIVED = "CUSTOMER_DEPOSIT_RECEIVED",
  UNIT_LISTING_SYNCED = "UNIT_LISTING_SYNCED",

  // Inventory (5)
  STOCK_TRANSFER_CREATED = "STOCK_TRANSFER_CREATED",
  STOCK_ISSUE_CREATED = "STOCK_ISSUE_CREATED",
  STOCK_COUNT_DUE = "STOCK_COUNT_DUE",
  SCRAP_GENERATED = "SCRAP_GENERATED",
  MATERIAL_PRICE_CHANGE = "MATERIAL_PRICE_CHANGE",

  // HR/DPR (5)
  DPR_SUBMITTED = "DPR_SUBMITTED",
  DPR_SUB_ADMIN_APPROVED = "DPR_SUB_ADMIN_APPROVED",
  DPR_APPROVED = "DPR_APPROVED",
  DPR_REJECTED = "DPR_REJECTED",
  PAYROLL_PROCESSED = "PAYROLL_PROCESSED",

  // Finance (3)
  EXPENSE_CREATED = "EXPENSE_CREATED",
  PROJECT_COST_ADDED = "PROJECT_COST_ADDED",
  GL_ENTRY_POSTED = "GL_ENTRY_POSTED",

  // Gate Pass (4)
  GATE_PASS_SUBMITTED = "GATE_PASS_SUBMITTED",
  GATE_PASS_APPROVED = "GATE_PASS_APPROVED",
  GATE_PASS_REJECTED = "GATE_PASS_REJECTED",
  GATE_PASS_EXITED = "GATE_PASS_EXITED",

  // Land (6)
  LAND_PURCHASE_CREATED = "LAND_PURCHASE_CREATED",
  LAND_PARTITIONED = "LAND_PARTITIONED",
  TENANCY_CREATED = "TENANCY_CREATED",
  TENANCY_TERMINATED = "TENANCY_TERMINATED",
  RENOVATION_COMPLETED = "RENOVATION_COMPLETED",
  LEASE_EXPIRY_WARNING = "LEASE_EXPIRY_WARNING",
}

export const ALL_EVENT_TYPES = Object.values(NotificationEventType);

export type NotificationUrgency = "IMMEDIATE" | "DAILY" | "WEEKLY";
export type NotificationChannel = "WHATSAPP" | "EMAIL" | "IN_APP";

/** Default urgency per event type */
export const EVENT_URGENCY: Record<NotificationEventType, NotificationUrgency> = {
  // Procurement — approvals are immediate, rest are daily
  [NotificationEventType.REQUISITION_SUBMITTED]: "IMMEDIATE",
  [NotificationEventType.REQUISITION_APPROVED]: "IMMEDIATE",
  [NotificationEventType.REQUISITION_REJECTED]: "IMMEDIATE",
  [NotificationEventType.REQUISITION_CONVERTED_TO_PO]: "DAILY",
  [NotificationEventType.PO_APPROVED]: "IMMEDIATE",
  [NotificationEventType.PO_ORDERED]: "DAILY",
  [NotificationEventType.GOODS_RECEIVED]: "DAILY",
  [NotificationEventType.SUPPLIER_PAYMENT_DUE]: "IMMEDIATE",
  [NotificationEventType.LOW_STOCK_ALERT]: "DAILY",

  // Sales
  [NotificationEventType.SALE_CREATED]: "IMMEDIATE",
  [NotificationEventType.SALE_PAYMENT_RECEIVED]: "IMMEDIATE",
  [NotificationEventType.SALE_CANCELLED]: "DAILY",
  [NotificationEventType.CUSTOMER_DEPOSIT_RECEIVED]: "IMMEDIATE",
  [NotificationEventType.UNIT_LISTING_SYNCED]: "WEEKLY",

  // Inventory
  [NotificationEventType.STOCK_TRANSFER_CREATED]: "DAILY",
  [NotificationEventType.STOCK_ISSUE_CREATED]: "DAILY",
  [NotificationEventType.STOCK_COUNT_DUE]: "DAILY",
  [NotificationEventType.SCRAP_GENERATED]: "DAILY",
  [NotificationEventType.MATERIAL_PRICE_CHANGE]: "WEEKLY",

  // HR/DPR
  [NotificationEventType.DPR_SUBMITTED]: "IMMEDIATE",
  [NotificationEventType.DPR_SUB_ADMIN_APPROVED]: "IMMEDIATE",
  [NotificationEventType.DPR_APPROVED]: "IMMEDIATE",
  [NotificationEventType.DPR_REJECTED]: "IMMEDIATE",
  [NotificationEventType.PAYROLL_PROCESSED]: "DAILY",

  // Finance
  [NotificationEventType.EXPENSE_CREATED]: "DAILY",
  [NotificationEventType.PROJECT_COST_ADDED]: "DAILY",
  [NotificationEventType.GL_ENTRY_POSTED]: "WEEKLY",

  // Gate Pass — all immediate (approvals + exit confirmation)
  [NotificationEventType.GATE_PASS_SUBMITTED]: "IMMEDIATE",
  [NotificationEventType.GATE_PASS_APPROVED]: "IMMEDIATE",
  [NotificationEventType.GATE_PASS_REJECTED]: "IMMEDIATE",
  [NotificationEventType.GATE_PASS_EXITED]: "IMMEDIATE",

  // Land
  [NotificationEventType.LAND_PURCHASE_CREATED]: "DAILY",
  [NotificationEventType.LAND_PARTITIONED]: "DAILY",
  [NotificationEventType.TENANCY_CREATED]: "IMMEDIATE",
  [NotificationEventType.TENANCY_TERMINATED]: "DAILY",
  [NotificationEventType.RENOVATION_COMPLETED]: "DAILY",
  [NotificationEventType.LEASE_EXPIRY_WARNING]: "IMMEDIATE",
};

export interface NotificationEvent {
  eventType: NotificationEventType;
  companyId: string;
  /** IDs of users who should be notified (resolved from role + preferences) */
  recipientIds?: string[];
  /** Entity context for the notification */
  entityType?: string;
  entityId?: string;
  /** Template variables for rendering */
  variables: Record<string, string>;
  /** When the event occurred */
  timestamp: Date;
}

/**
 * Emit a notification event. This is the main entry point called by
 * service functions after a mutation. The event bus resolves recipients
 * based on role + preferences, applies smart batching, and dispatches
 * to the appropriate channels.
 */
export async function emitNotificationEvent(event: NotificationEvent): Promise<void> {
  try {
    // Resolve recipients if not explicitly provided
    let recipientIds = event.recipientIds;
    if (!recipientIds || recipientIds.length === 0) {
      recipientIds = await resolveRecipients(event);
    }
    if (recipientIds.length === 0) return;

    const urgency = EVENT_URGENCY[event.eventType] ?? "DAILY";

    // For each recipient, check preferences and create notification log
    for (const userId of recipientIds) {
      // Check if user has this event type enabled
      const prefs = await prisma.notificationPreference.findMany({
        where: { companyId: event.companyId, userId, eventType: event.eventType },
      });

      // If no preferences exist, use defaults (enabled for IN_APP)
      const channels: NotificationChannel[] = prefs.length > 0
        ? prefs.filter((p) => p.enabled).map((p) => p.channel as NotificationChannel)
        : ["IN_APP"];

      if (channels.length === 0) continue; // User disabled all channels

      // Check quiet hours for non-IMMEDIATE notifications
      if (urgency !== "IMMEDIATE" && isWithinQuietHours()) {
        // Queue for later delivery (mark as PENDING)
        await prisma.notificationLog.create({
          data: {
            companyId: event.companyId,
            userId,
            eventType: event.eventType,
            channel: channels[0] as string,
            status: "PENDING",
            recipient: userId,
            message: renderEventMessage(event),
            metadata: JSON.stringify({
              ...event.variables,
              entityType: event.entityType,
              entityId: event.entityId,
              urgency,
              channels,
            }),
          },
        });
        continue;
      }

      // Check smart batching — if a notification for the same user+event
      // was created in the last 5 minutes, append to its metadata instead
      // of creating a new one
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentBatch = await prisma.notificationLog.findFirst({
        where: {
          userId,
          eventType: event.eventType,
          status: "PENDING",
          createdAt: { gte: fiveMinAgo },
        },
        orderBy: { createdAt: "desc" },
      });

      if (recentBatch) {
        // Append to existing batch
        const existingMeta = JSON.parse(recentBatch.metadata as string || "{}") as Record<string, unknown>;
        const batchCount = (Number(existingMeta._batchCount ?? 1)) + 1;
        await prisma.notificationLog.update({
          where: { id: recentBatch.id },
          data: {
            metadata: JSON.stringify({
              ...existingMeta,
              ...event.variables,
              _batchCount: batchCount,
              _batchMessage: `${batchCount} events of type ${event.eventType}`,
            }),
          },
        });
        continue;
      }

      // Create new notification log entry
      await prisma.notificationLog.create({
        data: {
          companyId: event.companyId,
          userId,
          eventType: event.eventType,
          channel: channels[0] as string,
          status: "PENDING",
          recipient: userId,
          message: renderEventMessage(event),
          metadata: JSON.stringify({
            ...event.variables,
            entityType: event.entityType,
            entityId: event.entityId,
            urgency,
            channels,
          }),
        },
      });
    }
  } catch (err) {
    // Notifications are best-effort — never fail the parent transaction
    console.error("[notification-event-bus] Failed to emit event:", err);
  }
}

/**
 * Resolve which users should receive a notification for a given event.
 * Based on role: OWNER/ADMIN get all, MANAGER gets procurement+DPR+finance,
 * SUPERVISOR gets inventory+DPR, SALES gets sales, ACCOUNTANT gets finance.
 */
async function resolveRecipients(event: NotificationEvent): Promise<string[]> {
  const memberships = await prisma.userCompany.findMany({
    where: { companyId: event.companyId },
    include: { user: { select: { id: true, active: true } } },
  });

  return memberships
    .filter((m) => m.user.active)
    .filter((m) => shouldRoleReceiveEvent(m.role, event.eventType))
    .map((m) => m.user.id);
}

function shouldRoleReceiveEvent(role: string, eventType: NotificationEventType): boolean {
  const PROCUREMENT_EVENTS = new Set([
    NotificationEventType.REQUISITION_SUBMITTED,
    NotificationEventType.REQUISITION_APPROVED,
    NotificationEventType.REQUISITION_REJECTED,
    NotificationEventType.REQUISITION_CONVERTED_TO_PO,
    NotificationEventType.PO_APPROVED,
    NotificationEventType.PO_ORDERED,
    NotificationEventType.GOODS_RECEIVED,
    NotificationEventType.SUPPLIER_PAYMENT_DUE,
    NotificationEventType.LOW_STOCK_ALERT,
  ]);
  const SALES_EVENTS = new Set([
    NotificationEventType.SALE_CREATED,
    NotificationEventType.SALE_PAYMENT_RECEIVED,
    NotificationEventType.SALE_CANCELLED,
    NotificationEventType.CUSTOMER_DEPOSIT_RECEIVED,
    NotificationEventType.UNIT_LISTING_SYNCED,
  ]);
  const DPR_EVENTS = new Set([
    NotificationEventType.DPR_SUBMITTED,
    NotificationEventType.DPR_SUB_ADMIN_APPROVED,
    NotificationEventType.DPR_APPROVED,
    NotificationEventType.DPR_REJECTED,
  ]);
  const FINANCE_EVENTS = new Set([
    NotificationEventType.EXPENSE_CREATED,
    NotificationEventType.PROJECT_COST_ADDED,
    NotificationEventType.GL_ENTRY_POSTED,
    NotificationEventType.PAYROLL_PROCESSED,
    NotificationEventType.SUPPLIER_PAYMENT_DUE,
  ]);
  const LAND_EVENTS = new Set([
    NotificationEventType.LAND_PURCHASE_CREATED,
    NotificationEventType.LAND_PARTITIONED,
    NotificationEventType.TENANCY_CREATED,
    NotificationEventType.TENANCY_TERMINATED,
    NotificationEventType.RENOVATION_COMPLETED,
    NotificationEventType.LEASE_EXPIRY_WARNING,
  ]);

  if (role === "OWNER" || role === "ADMIN") return true;
  if (role === "PROJECT_DIRECTOR" || role === "FINANCE_HEAD") {
    return PROCUREMENT_EVENTS.has(eventType) || DPR_EVENTS.has(eventType) || FINANCE_EVENTS.has(eventType) || LAND_EVENTS.has(eventType);
  }
  if (role === "PROJECT_MANAGER" || role === "PROCUREMENT_MANAGER" || role === "HR_MANAGER") {
    return PROCUREMENT_EVENTS.has(eventType) || DPR_EVENTS.has(eventType) || FINANCE_EVENTS.has(eventType) || LAND_EVENTS.has(eventType);
  }
  if (role === "SUPERVISOR" || role === "QAQC_ENGINEER" || role === "SITE_ENGINEER") {
    return PROCUREMENT_EVENTS.has(eventType) || DPR_EVENTS.has(eventType);
  }
  if (role === "SALES_MANAGER") return SALES_EVENTS.has(eventType) || LAND_EVENTS.has(eventType);
  if (role === "ACCOUNTANT") return FINANCE_EVENTS.has(eventType) || SALES_EVENTS.has(eventType) || LAND_EVENTS.has(eventType);
  if (role === "STORE_KEEPER") return PROCUREMENT_EVENTS.has(eventType);
  return false;
}

/** Check if current time is within quiet hours (10 PM - 7 AM IST) */
function isWithinQuietHours(): boolean {
  const now = new Date();
  const istHour = (now.getUTCHours() + 5 + 30 / 60) % 24;
  return istHour >= 22 || istHour < 7;
}

/** Render a basic message for the event */
function renderEventMessage(event: NotificationEvent): string {
  const varStr = Object.entries(event.variables)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return `${event.eventType}: ${varStr}`;
}
