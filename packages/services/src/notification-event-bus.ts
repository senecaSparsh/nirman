/**
 * Notification Event Bus — centralized event-driven notification system.
 *
 * Event types span procurement, sales, inventory, HR/DPR, finance,
 * equipment, quality, petty cash, gate pass, land, and legal workflows.
 * Events are emitted by service functions and dispatched to notification
 * handlers that send WhatsApp/email/in-app messages based on user
 * preferences.
 *
 * In-app bell entries are created immediately per event. External-channel
 * sends go through PENDING NotificationLog rows, where a 5-minute window
 * batches bursts for the same user+event type into a single summarized
 * send. Urgency levels (IMMEDIATE/DAILY/WEEKLY) control whether the
 * quiet-hours gate (10 PM – 7 AM IST) applies at flush time.
 */

import { prisma, type Prisma } from "@nirman/db";
import { sendPushToUser } from "./push";

/**
 * Compute the IST hour (0-23.999...) from a UTC date.
 * Pure function — no DB access, no `new Date()` side effect.
 *
 * IST = UTC + 5:30. The result is wrapped to [0, 24).
 */
export function getIstHour(date: Date): number {
  return (date.getUTCHours() + 5 + 30 / 60) % 24;
}

/**
 * Check if an IST hour falls within quiet hours (10 PM - 7 AM IST).
 * Pure function — no DB access.
 */
export function isQuietHour(istHour: number): boolean {
  return istHour >= 22 || istHour < 7;
}

/** Check if current time is within quiet hours (10 PM - 7 AM IST) */
export function isWithinQuietHours(): boolean {
  return isQuietHour(getIstHour(new Date()));
}

/** 27 event types across 5 workflows */
export enum NotificationEventType {
  // Procurement (10)
  REQUISITION_SUBMITTED = "REQUISITION_SUBMITTED",
  REQUISITION_APPROVED = "REQUISITION_APPROVED",
  REQUISITION_REJECTED = "REQUISITION_REJECTED",
  REQUISITION_CONVERTED_TO_PO = "REQUISITION_CONVERTED_TO_PO",
  PO_CREATED = "PO_CREATED",
  PO_APPROVED = "PO_APPROVED",
  PO_ORDERED = "PO_ORDERED",
  GOODS_RECEIVED = "GOODS_RECEIVED",
  SUPPLIER_PAYMENT_DUE = "SUPPLIER_PAYMENT_DUE",
  LOW_STOCK_ALERT = "LOW_STOCK_ALERT",

  // Sales (6)
  SALE_CREATED = "SALE_CREATED",
  SALE_PAYMENT_RECEIVED = "SALE_PAYMENT_RECEIVED",
  SALE_PAYMENT_DUE = "SALE_PAYMENT_DUE",
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

  // Equipment (4)
  EQUIPMENT_MAINTENANCE_DUE = "EQUIPMENT_MAINTENANCE_DUE",
  EQUIPMENT_ASSIGNED = "EQUIPMENT_ASSIGNED",
  EQUIPMENT_SOLD = "EQUIPMENT_SOLD",
  EQUIPMENT_RETIRED = "EQUIPMENT_RETIRED",

  // Quality — NCR/CAPA (3)
  NCR_RAISED = "NCR_RAISED",
  CAPA_DUE = "CAPA_DUE",
  CAPA_OVERDUE = "CAPA_OVERDUE",

  // Petty Cash (2)
  PETTY_CASH_LOW_BALANCE = "PETTY_CASH_LOW_BALANCE",
  PETTY_CASH_TOPUP = "PETTY_CASH_TOPUP",

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
  RENT_DUE_REMINDER = "RENT_DUE_REMINDER",
  RENT_ESCALATION_APPLIED = "RENT_ESCALATION_APPLIED",
  LAND_PAYMENT_DUE = "LAND_PAYMENT_DUE",

  // Legal / Compliance (1)
  LEGAL_DOC_EXPIRING = "LEGAL_DOC_EXPIRING",
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
  [NotificationEventType.PO_CREATED]: "IMMEDIATE",
  [NotificationEventType.PO_APPROVED]: "IMMEDIATE",
  [NotificationEventType.PO_ORDERED]: "DAILY",
  [NotificationEventType.GOODS_RECEIVED]: "DAILY",
  [NotificationEventType.SUPPLIER_PAYMENT_DUE]: "IMMEDIATE",
  [NotificationEventType.LOW_STOCK_ALERT]: "DAILY",

  // Sales
  [NotificationEventType.SALE_CREATED]: "IMMEDIATE",
  [NotificationEventType.SALE_PAYMENT_RECEIVED]: "IMMEDIATE",
  [NotificationEventType.SALE_PAYMENT_DUE]: "IMMEDIATE",
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

  // Equipment
  [NotificationEventType.EQUIPMENT_MAINTENANCE_DUE]: "IMMEDIATE",
  [NotificationEventType.EQUIPMENT_ASSIGNED]: "DAILY",
  [NotificationEventType.EQUIPMENT_SOLD]: "DAILY",
  [NotificationEventType.EQUIPMENT_RETIRED]: "DAILY",

  // Quality — NCR/CAPA
  [NotificationEventType.NCR_RAISED]: "IMMEDIATE",
  [NotificationEventType.CAPA_DUE]: "IMMEDIATE",
  [NotificationEventType.CAPA_OVERDUE]: "IMMEDIATE",

  // Petty Cash
  [NotificationEventType.PETTY_CASH_LOW_BALANCE]: "DAILY",
  [NotificationEventType.PETTY_CASH_TOPUP]: "DAILY",

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
  [NotificationEventType.RENT_DUE_REMINDER]: "IMMEDIATE",
  [NotificationEventType.RENT_ESCALATION_APPLIED]: "DAILY",
  [NotificationEventType.LAND_PAYMENT_DUE]: "IMMEDIATE",

  // Legal / Compliance
  [NotificationEventType.LEGAL_DOC_EXPIRING]: "IMMEDIATE",
};

export interface NotificationEvent {
  eventType: NotificationEventType;
  companyId: string;
  /** Explicit recipients. When non-empty, REPLACES role resolution entirely —
   *  use for personal/sensitive notices that must not broadcast by role. */
  recipientIds?: (string | null | undefined)[];
  /** Additional recipients UNIONED with role-resolved recipients — e.g. the
   *  submitter of an entity being approved, whose role may not subscribe to
   *  this event type. */
  extraRecipientIds?: (string | null | undefined)[];
  /** Users to exclude from the final set — typically the actor who triggered
   *  the event (they don't need a "you did X" ping). */
  excludeIds?: (string | null | undefined)[];
  /** Entity context for the notification */
  entityType?: string;
  entityId?: string;
  /** Template variables for rendering */
  variables: Record<string, string>;
  /** When the event occurred */
  timestamp: Date;
}

/**
 * Map an entity type to the app's MOBILE route path (`/m/...`).
 *
 * Notifications link straight to the mobile route — the dominant surface for
 * field staff. A desktop user who opens a `/m/...` link is redirected to the
 * desktop equivalent by the SurfaceAdapter; the reverse never happens (a
 * mobile user must never land on a desktop page). Emitting the mobile path
 * also makes the stored link safe for push notifications, which open a single
 * fixed URL on the user's phone.
 *
 * Entities without a mobile detail page point at their mobile LIST route and
 * appear in MOBILE_LIST_ONLY below (the ID is not appended).
 */
const ENTITY_ROUTE_MAP: Record<string, string> = {
  PurchaseOrder: "/m/procurement",
  MaterialRequisition: "/m/requisitions",
  GatePass: "/m/gate-pass",
  DailyProgressReport: "/m/dprs",
  RaBill: "/m/work-orders",
  ExpenseClaim: "/m/expense-claims",
  Expense: "/m/expenses",
  SupplierInvoice: "/m/accounts",
  SupplierPayment: "/m/supplier-payments",
  GoodsReceipt: "/m/procurement",
  MeasurementBookEntry: "/m/measurement-book",
  SubcontractorWorkOrder: "/m/work-orders",
  VendorQuote: "/m/quotations",
  QuotationRequest: "/m/quotations",
  Sale: "/m/sales",
  Lead: "/m/leads",
  StockMovement: "/m/stock",
  MaterialIssue: "/m/material-issues",
  StockTransfer: "/m/transfers",
  ChangeOrder: "/m/change-orders",
  NonConformanceReport: "/m/quality-control/ncr",
  SafetyIncident: "/m/safety/incidents",
  PayrollPeriod: "/m/hr",
  LeaveRequest: "/m/hr/leaves",
  LandPurchase: "/m/land",
  LandParcel: "/m/land",
  BuiltUnit: "/m/units",
  Project: "/m/projects",
  ProjectCost: "/m/accounts",
  AssetSale: "/m/sales",
  MaterialSale: "/m/material-sales",
  Tenancy: "/m/rentals",
  Equipment: "/m/equipment",
  EquipmentAssignment: "/m/equipment",
  Capa: "/m/quality-control",
  PettyCashFloat: "/m/petty-cash",
  PettyCashTopUp: "/m/petty-cash",
  RenovationProject: "/m/projects",
};

/**
 * Entity types that only have a list page on mobile (no detail page).
 * For these, entityLink returns the list page without appending the ID.
 */
const LIST_ONLY_ENTITIES = new Set([
  "GatePass",
  "Capa",
  "PettyCashFloat",
  "PettyCashTopUp",
  "RenovationProject",
  "SupplierInvoice",
  "SupplierPayment",
  "ProjectCost",
  "StockMovement",
  "PayrollPeriod",
  // entityId is the bill's own id, but the mobile detail route expects the
  // parent work-order id — link to the list instead of a 404 detail.
  "RaBill",
  "GoodsReceipt",
  // Leave requests have no mobile detail page — link to the leave list.
  "LeaveRequest",
  // The land detail route is keyed on LandPurchase id, not LandParcel id —
  // linking a parcel id would 404. Send to the land list instead.
  "LandParcel",
  // The equipment detail route is keyed on Equipment id, not
  // EquipmentAssignment id — linking an assignment id would 404.
  "EquipmentAssignment",
]);

function entityLink(entityType?: string, entityId?: string): string | null {
  if (!entityType || !entityId) return null;
  const base = ENTITY_ROUTE_MAP[entityType];
  if (base) {
    // List-only entities: return the list page without appending the ID
    if (LIST_ONLY_ENTITIES.has(entityType)) return base;
    return `${base}/${entityId}`;
  }
  // Unknown entity type → no link (a guessed route would 404)
  return null;
}

/**
 * Metadata on NotificationLog rows is stored as a stringified JSON value
 * (double-encoded) for historical reasons; rows written elsewhere may hold a
 * plain object. This reader tolerates both.
 */
export function parseNotificationMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

/**
 * Emit a notification event. This is the main entry point called by
 * service functions after a mutation.
 *
 * Delivery model:
 * - InAppNotification (the bell) is created immediately for every recipient
 *   with IN_APP enabled — one row per event, always. The bell is a passive
 *   list, so quiet hours and batching do NOT apply to it.
 * - Each external channel still owed gets a PENDING NotificationLog, which
 *   `processPendingNotifications` flushes (respecting quiet hours via the
 *   `urgency` stored in metadata). Batching merges bursts of the same
 *   user+eventType within 5 minutes into that pending log — the log's message
 *   is updated to summarize ("latest message (+N more)") so no event is lost.
 * - A recipient with only IN_APP gets a SENT audit row — delivered already,
 *   nothing left for the flush to do.
 */
export async function emitNotificationEvent(event: NotificationEvent): Promise<void> {
  try {
    // Resolve recipients: explicit list replaces role resolution entirely;
    // otherwise role-resolved ∪ extraRecipientIds, minus excludeIds.
    const explicit = (event.recipientIds ?? []).filter((id): id is string => Boolean(id));
    const extra = (event.extraRecipientIds ?? []).filter((id): id is string => Boolean(id));
    const excluded = new Set((event.excludeIds ?? []).filter((id): id is string => Boolean(id)));

    let resolved: string[];
    if (explicit.length > 0) {
      resolved = [...explicit, ...extra];
    } else {
      resolved = [...(await resolveRecipients(event)), ...extra];
    }
    const recipientIds = [...new Set(resolved)].filter((id) => !excluded.has(id));
    if (recipientIds.length === 0) return;

    const urgency = EVENT_URGENCY[event.eventType] ?? "DAILY";
    const title = humanize(event.eventType);
    const message = renderEventMessage(event);
    const link = entityLink(event.entityType, event.entityId);
    const baseMetadata = {
      ...event.variables,
      entityType: event.entityType,
      entityId: event.entityId,
      urgency,
      title,
    };

    // One batched prefs query for all recipients (avoids N+1 per user)
    const allPrefs = await prisma.notificationPreference.findMany({
      where: {
        companyId: event.companyId,
        eventType: event.eventType,
        userId: { in: recipientIds },
      },
    });
    const prefsByUser = new Map<string, typeof allPrefs>();
    for (const p of allPrefs) {
      const list = prefsByUser.get(p.userId) ?? [];
      list.push(p);
      prefsByUser.set(p.userId, list);
    }

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    for (const userId of recipientIds) {
      const userPrefs = prefsByUser.get(userId) ?? [];
      // No preference rows → default is IN_APP only (external is opt-in).
      const channels: NotificationChannel[] = userPrefs.length > 0
        ? userPrefs.filter((p) => p.enabled).map((p) => p.channel as NotificationChannel)
        : ["IN_APP"];
      if (channels.length === 0) continue; // user disabled everything

      // Bell entry — immediate, one per event, never batched or deferred.
      if (channels.includes("IN_APP")) {
        await prisma.inAppNotification.create({
          data: {
            companyId: event.companyId,
            userId,
            eventType: event.eventType,
            title,
            message,
            link,
            metadata: JSON.stringify(baseMetadata) as Prisma.InputJsonValue,
          },
        }).catch(() => {
          // Best-effort — don't fail the event bus if InAppNotification creation fails
        });

        // Web push mirrors the bell — an active PushSubscription is itself the
        // opt-in (the user explicitly granted permission + subscribed via the
        // settings toggle), so no separate channel pref is needed. Push buzzes
        // the device, so unlike the passive bell it respects quiet hours for
        // non-IMMEDIATE events; the bell entry above still records everything.
        // `tag` = eventType so a burst of same-type pushes collapses into one
        // shade entry instead of stacking.
        if (urgency === "IMMEDIATE" || !isWithinQuietHours()) {
          void sendPushToUser(userId, {
            title,
            body: message,
            href: link ?? "/m/home",
            tag: event.eventType,
          }).catch(() => {});
        }
      }

      const external = channels.filter((c) => c !== "IN_APP");

      if (external.length === 0) {
        // Fully delivered in-app — SENT audit row keeps stats honest and
        // stays out of the pending-flush queue.
        await prisma.notificationLog.create({
          data: {
            companyId: event.companyId,
            userId,
            eventType: event.eventType,
            channel: "IN_APP",
            status: "SENT",
            sentAt: new Date(),
            recipient: userId,
            message,
            metadata: JSON.stringify({ ...baseMetadata, channels }),
          },
        });
        continue;
      }

      // External channels still owed. Merge into an existing pending log for
      // the same user+eventType within 5 min — the burst becomes ONE send
      // carrying the latest message plus a count, instead of N sends (or
      // silently dropped events).
      const recentBatch = await prisma.notificationLog.findFirst({
        where: {
          companyId: event.companyId,
          userId,
          eventType: event.eventType,
          status: "PENDING",
          createdAt: { gte: fiveMinAgo },
        },
        orderBy: { createdAt: "desc" },
      });

      if (recentBatch) {
        const existingMeta = parseNotificationMetadata(recentBatch.metadata);
        const batchCount = Number(existingMeta._batchCount ?? 1) + 1;
        await prisma.notificationLog.update({
          where: { id: recentBatch.id },
          data: {
            message: `${message} (+${batchCount - 1} more)`,
            metadata: JSON.stringify({
              ...existingMeta,
              ...event.variables,
              _batchCount: batchCount,
            }),
          },
        });
        continue;
      }

      await prisma.notificationLog.create({
        data: {
          companyId: event.companyId,
          userId,
          eventType: event.eventType,
          channel: external[0] as string,
          status: "PENDING",
          recipient: userId,
          message,
          metadata: JSON.stringify({ ...baseMetadata, channels: external }),
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

const PROCUREMENT_EVENTS = new Set([
  NotificationEventType.REQUISITION_SUBMITTED,
  NotificationEventType.REQUISITION_APPROVED,
  NotificationEventType.REQUISITION_REJECTED,
  NotificationEventType.REQUISITION_CONVERTED_TO_PO,
  NotificationEventType.PO_CREATED,
  NotificationEventType.PO_APPROVED,
  NotificationEventType.PO_ORDERED,
  NotificationEventType.GOODS_RECEIVED,
  NotificationEventType.SUPPLIER_PAYMENT_DUE,
  NotificationEventType.LOW_STOCK_ALERT,
]);
const SALES_EVENTS = new Set([
  NotificationEventType.SALE_CREATED,
  NotificationEventType.SALE_PAYMENT_RECEIVED,
  NotificationEventType.SALE_PAYMENT_DUE,
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
  NotificationEventType.PETTY_CASH_LOW_BALANCE,
  NotificationEventType.PETTY_CASH_TOPUP,
]);
const LAND_EVENTS = new Set([
  NotificationEventType.LAND_PURCHASE_CREATED,
  NotificationEventType.LAND_PARTITIONED,
  NotificationEventType.TENANCY_CREATED,
  NotificationEventType.TENANCY_TERMINATED,
  NotificationEventType.RENOVATION_COMPLETED,
  NotificationEventType.LEASE_EXPIRY_WARNING,
  NotificationEventType.RENT_DUE_REMINDER,
  NotificationEventType.RENT_ESCALATION_APPLIED,
  NotificationEventType.LAND_PAYMENT_DUE,
  NotificationEventType.LEGAL_DOC_EXPIRING,
]);
const EQUIPMENT_EVENTS = new Set([
  NotificationEventType.EQUIPMENT_MAINTENANCE_DUE,
  NotificationEventType.EQUIPMENT_ASSIGNED,
  NotificationEventType.EQUIPMENT_SOLD,
  NotificationEventType.EQUIPMENT_RETIRED,
]);
const QUALITY_EVENTS = new Set([
  NotificationEventType.NCR_RAISED,
  NotificationEventType.CAPA_DUE,
  NotificationEventType.CAPA_OVERDUE,
]);
const INVENTORY_EVENTS = new Set([
  NotificationEventType.STOCK_TRANSFER_CREATED,
  NotificationEventType.STOCK_ISSUE_CREATED,
  NotificationEventType.STOCK_COUNT_DUE,
  NotificationEventType.SCRAP_GENERATED,
  NotificationEventType.MATERIAL_PRICE_CHANGE,
]);
const GATE_PASS_EVENTS = new Set([
  NotificationEventType.GATE_PASS_SUBMITTED,
  NotificationEventType.GATE_PASS_APPROVED,
  NotificationEventType.GATE_PASS_REJECTED,
  NotificationEventType.GATE_PASS_EXITED,
]);

export function shouldRoleReceiveEvent(role: string, eventType: NotificationEventType): boolean {
  if (role === "OWNER" || role === "ADMIN" || role === "DEVELOPER") return true;
  if (role === "PROJECT_DIRECTOR" || role === "FINANCE_HEAD") {
    return PROCUREMENT_EVENTS.has(eventType) || DPR_EVENTS.has(eventType) || FINANCE_EVENTS.has(eventType) || LAND_EVENTS.has(eventType) || EQUIPMENT_EVENTS.has(eventType) || QUALITY_EVENTS.has(eventType) || INVENTORY_EVENTS.has(eventType) || GATE_PASS_EVENTS.has(eventType);
  }
  if (role === "PROJECT_MANAGER" || role === "PROCUREMENT_MANAGER" || role === "HR_MANAGER") {
    return PROCUREMENT_EVENTS.has(eventType) || DPR_EVENTS.has(eventType) || FINANCE_EVENTS.has(eventType) || LAND_EVENTS.has(eventType) || EQUIPMENT_EVENTS.has(eventType) || INVENTORY_EVENTS.has(eventType) || GATE_PASS_EVENTS.has(eventType);
  }
  if (role === "SUPERVISOR" || role === "QAQC_ENGINEER" || role === "SITE_ENGINEER") {
    return PROCUREMENT_EVENTS.has(eventType) || DPR_EVENTS.has(eventType) || EQUIPMENT_EVENTS.has(eventType) || QUALITY_EVENTS.has(eventType) || INVENTORY_EVENTS.has(eventType) || GATE_PASS_EVENTS.has(eventType);
  }
  if (role === "SALES_MANAGER") return SALES_EVENTS.has(eventType) || LAND_EVENTS.has(eventType);
  if (role === "ACCOUNTANT") return FINANCE_EVENTS.has(eventType) || SALES_EVENTS.has(eventType) || LAND_EVENTS.has(eventType) || EQUIPMENT_EVENTS.has(eventType) || INVENTORY_EVENTS.has(eventType);
  if (role === "STORE_KEEPER") return PROCUREMENT_EVENTS.has(eventType) || EQUIPMENT_EVENTS.has(eventType) || INVENTORY_EVENTS.has(eventType) || GATE_PASS_EVENTS.has(eventType);
  return false;
}

/** Render a basic message for the event */
export function renderEventMessage(event: NotificationEvent): string {
  const v = event.variables as Record<string, unknown>;
  const s = (key: string): string => (v[key] == null ? "" : String(v[key]));
  // Money vars arrive as decimal strings — prefix ₹ when non-empty.
  const money = (key: string): string => {
    const raw = s(key);
    return raw ? `₹${raw}` : "";
  };

  const msg = EVENT_MESSAGES[event.eventType]?.({ s, money });
  if (msg) return msg;

  // Fallback — humanize the type + list any provided vars readably
  const varStr = Object.entries(v)
    .map(([k, val]) => `${k}=${val}`)
    .join(", ");
  return `${humanize(event.eventType)}${varStr ? ` — ${varStr}` : ""}`;
}

function humanize(eventType: string): string {
  return eventType
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Plain-language message per event type — what the user actually sees in the
 * in-app bell / WhatsApp when no company template overrides it. */
const EVENT_MESSAGES: Partial<
  Record<NotificationEventType, (ctx: { s: (k: string) => string; money: (k: string) => string }) => string>
> = {
  // Procurement
  [NotificationEventType.REQUISITION_SUBMITTED]: ({ s }) =>
    `Indent ${s("reqNumber") || s("requisitionNumber")} submitted for approval.`,
  [NotificationEventType.REQUISITION_APPROVED]: ({ s }) =>
    `Indent ${s("reqNumber") || s("requisitionNumber")} approved${s("approverName") ? ` by ${s("approverName")}` : ""}.`,
  [NotificationEventType.REQUISITION_REJECTED]: ({ s }) =>
    `Indent ${s("reqNumber") || s("requisitionNumber")} rejected${s("reason") ? `: ${s("reason")}` : ""}.`,
  [NotificationEventType.REQUISITION_CONVERTED_TO_PO]: ({ s }) =>
    `Indent ${s("reqNumber") || s("requisitionNumber")} converted to PO ${s("poNumber")}.`,
  [NotificationEventType.PO_CREATED]: ({ s, money }) =>
    `PO ${s("poNumber")} created${money("total") ? ` for ${money("total")}` : ""} — needs approval.`,
  [NotificationEventType.PO_APPROVED]: ({ s, money }) =>
    `PO ${s("poNumber")} approved${money("total") ? ` (${money("total")})` : ""} — ready to order.`,
  [NotificationEventType.PO_ORDERED]: ({ s }) =>
    `PO ${s("poNumber")} sent to supplier.`,
  [NotificationEventType.GOODS_RECEIVED]: ({ s }) =>
    `Goods received${s("poNumber") ? ` against PO ${s("poNumber")}` : ""}${s("grnNumber") ? ` (GRN ${s("grnNumber")})` : ""}.`,
  [NotificationEventType.SUPPLIER_PAYMENT_DUE]: ({ s, money }) =>
    `Payment due to ${s("supplierName") || "supplier"}${money("amount") ? ` — ${money("amount")}` : ""}.`,
  [NotificationEventType.LOW_STOCK_ALERT]: ({ s }) =>
    `Low stock: ${s("materialName") || s("material")}${s("currentQty") ? ` — ${s("currentQty")} left` : ""}.`,

  // Sales
  [NotificationEventType.SALE_CREATED]: ({ s, money }) =>
    `Sale ${s("saleNumber")} created${money("salePrice") ? ` for ${money("salePrice")}` : ""}.`,
  [NotificationEventType.SALE_PAYMENT_RECEIVED]: ({ s, money }) =>
    `Payment of ${money("amount")} received${s("mode") ? ` via ${s("mode")}` : ""}.`,
  [NotificationEventType.SALE_PAYMENT_DUE]: ({ s, money }) =>
    `Payment due on sale ${s("saleNumber")}${money("amount") ? ` — ${money("amount")}` : ""}.`,
  [NotificationEventType.SALE_CANCELLED]: ({ s }) =>
    `Sale ${s("saleNumber")} cancelled.`,
  [NotificationEventType.CUSTOMER_DEPOSIT_RECEIVED]: ({ s, money }) =>
    `Deposit ${money("amount")} received from ${s("customerName") || "customer"}.`,
  [NotificationEventType.UNIT_LISTING_SYNCED]: ({ s }) =>
    `Unit listing ${s("unitNumber") || s("listingTitle")} synced to portal.`,

  // Inventory
  [NotificationEventType.STOCK_TRANSFER_CREATED]: ({ s }) =>
    `Stock transfer ${s("transferNumber")} created${s("fromName") && s("toName") ? ` — ${s("fromName")} → ${s("toName")}` : ""}.`,
  [NotificationEventType.STOCK_ISSUE_CREATED]: ({ s }) =>
    `Material issue ${s("issueNumber")} created — needs gate pass.`,
  [NotificationEventType.STOCK_COUNT_DUE]: ({ s }) =>
    `Stock count due${s("locationName") ? ` at ${s("locationName")}` : ""}.`,
  [NotificationEventType.SCRAP_GENERATED]: ({ s }) =>
    `Scrap generation ${s("scrapNumber")} recorded.`,
  [NotificationEventType.MATERIAL_PRICE_CHANGE]: ({ s }) =>
    `Price change: ${s("materialName")}${s("newPrice") ? ` → ${s("newPrice")}` : ""}.`,

  // HR / DPR
  [NotificationEventType.DPR_SUBMITTED]: ({ s }) =>
    `Daily report for ${s("date")} submitted — needs review.`,
  [NotificationEventType.DPR_SUB_ADMIN_APPROVED]: () =>
    `Daily report approved by site supervisor — pending admin approval.`,
  [NotificationEventType.DPR_APPROVED]: () =>
    `Daily report approved.`,
  [NotificationEventType.DPR_REJECTED]: ({ s }) =>
    `Daily report rejected${s("reason") ? `: ${s("reason")}` : ""}.`,
  [NotificationEventType.PAYROLL_PROCESSED]: ({ s, money }) =>
    `Payroll processed${s("month") ? ` for ${s("month")}` : ""}${money("totalAmount") ? ` — ${money("totalAmount")}` : ""}.`,

  // Finance
  [NotificationEventType.EXPENSE_CREATED]: ({ s, money }) =>
    `Expense ${s("claimNumber") || "recorded"}${money("amount") ? ` — ${money("amount")}` : ""}.`,
  [NotificationEventType.PROJECT_COST_ADDED]: ({ s, money }) =>
    `Project cost added${money("amount") ? ` — ${money("amount")}` : ""}${s("projectName") ? ` on ${s("projectName")}` : ""}.`,
  [NotificationEventType.GL_ENTRY_POSTED]: ({ s, money }) =>
    `Journal entry ${s("entryNumber") || "posted"}${money("amount") ? ` — ${money("amount")}` : ""}.`,

  // Equipment
  [NotificationEventType.EQUIPMENT_MAINTENANCE_DUE]: ({ s }) =>
    `Maintenance due: ${s("equipmentName") || s("name")}.`,
  [NotificationEventType.EQUIPMENT_ASSIGNED]: ({ s }) =>
    `Equipment ${s("equipmentName") || s("name")} assigned${s("projectName") ? ` to ${s("projectName")}` : ""}.`,
  [NotificationEventType.EQUIPMENT_SOLD]: ({ s, money }) =>
    `Equipment ${s("equipmentName") || s("name")} sold${money("salePrice") ? ` for ${money("salePrice")}` : ""}.`,
  [NotificationEventType.EQUIPMENT_RETIRED]: ({ s }) =>
    `Equipment ${s("equipmentName") || s("name")} retired.`,

  // Quality
  [NotificationEventType.NCR_RAISED]: ({ s }) =>
    `NCR ${s("ncrNumber")} raised: ${s("title")}${s("severity") ? ` (${s("severity")})` : ""}.`,
  [NotificationEventType.CAPA_DUE]: ({ s }) =>
    `CAPA ${s("capaNumber")} due${s("dueDate") ? ` on ${s("dueDate")}` : ""}.`,
  [NotificationEventType.CAPA_OVERDUE]: ({ s }) =>
    `CAPA ${s("capaNumber")} is overdue.`,

  // Petty cash
  [NotificationEventType.PETTY_CASH_LOW_BALANCE]: ({ s, money }) =>
    `Petty cash low${s("floatName") ? ` (${s("floatName")})` : ""}${money("balance") ? ` — ${money("balance")} left` : ""}.`,
  [NotificationEventType.PETTY_CASH_TOPUP]: ({ s, money }) =>
    `Petty cash topped up${s("floatName") ? ` (${s("floatName")})` : ""}${money("amount") ? ` by ${money("amount")}` : ""}.`,

  // Gate pass
  [NotificationEventType.GATE_PASS_SUBMITTED]: ({ s }) =>
    `Gate pass ${s("gatePassNumber")} submitted — needs approval.`,
  [NotificationEventType.GATE_PASS_APPROVED]: ({ s }) =>
    `Gate pass ${s("gatePassNumber")} approved.`,
  [NotificationEventType.GATE_PASS_REJECTED]: ({ s }) =>
    `Gate pass ${s("gatePassNumber")} rejected${s("reason") ? `: ${s("reason")}` : ""}.`,
  [NotificationEventType.GATE_PASS_EXITED]: ({ s }) =>
    `Gate pass ${s("gatePassNumber")} — vehicle exited.`,

  // Land / tenancy
  [NotificationEventType.LAND_PURCHASE_CREATED]: ({ s }) =>
    `Land purchase ${s("landName") || s("sellerName")} recorded.`,
  [NotificationEventType.LAND_PARTITIONED]: ({ s }) =>
    `Land ${s("landName")} partitioned into ${s("parcelCount") || "plots"}.`,
  [NotificationEventType.TENANCY_CREATED]: ({ s }) =>
    `Tenancy created for ${s("tenantName")}${s("monthlyRent") ? ` at ₹${s("monthlyRent")}/mo` : ""}.`,
  [NotificationEventType.TENANCY_TERMINATED]: ({ s }) =>
    `Tenancy for ${s("tenantName")} terminated.`,
  [NotificationEventType.RENOVATION_COMPLETED]: ({ s }) =>
    `Renovation completed${s("unitNumber") ? ` on ${s("unitNumber")}` : ""}.`,
  [NotificationEventType.LEASE_EXPIRY_WARNING]: ({ s }) =>
    `Lease expiring: ${s("sellerName") || s("tenantName")}${s("daysUntilExpiry") ? ` in ${s("daysUntilExpiry")} days` : ""}.`,
  [NotificationEventType.RENT_DUE_REMINDER]: ({ s, money }) =>
    `Rent due: ${s("tenantName")}${money("amount") ? ` — ${money("amount")}` : ""}.`,
  [NotificationEventType.RENT_ESCALATION_APPLIED]: ({ s, money }) =>
    `Rent escalated for ${s("tenantName")}${money("newRent") ? ` — now ${money("newRent")}` : ""}.`,
  [NotificationEventType.LAND_PAYMENT_DUE]: ({ s, money }) =>
    `Land payment due${s("sellerName") ? ` to ${s("sellerName")}` : ""}${money("amount") ? ` — ${money("amount")}` : ""}.`,

  // Legal
  [NotificationEventType.LEGAL_DOC_EXPIRING]: ({ s }) =>
    `Document expiring: ${s("docName") || s("documentType")}${s("daysUntilExpiry") ? ` in ${s("daysUntilExpiry")} days` : ""}.`,
};
