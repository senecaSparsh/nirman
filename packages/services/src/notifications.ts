import { prisma } from "@nirman/db";
import type { Prisma } from "@nirman/db";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Notification Service — WhatsApp / email / in-app alerts.
 *
 * Templates are per-company per-event-type with {{variable}} placeholders.
 * The WhatsApp provider is pluggable: a StubWhatsAppProvider logs messages
 * (for development); a real provider would call the WhatsApp Business API
 * (or a service like Twilio).
 *
 * Event types:
 *   LOW_STOCK        — material stock dropped to/below reorder point
 *   TASK_ASSIGNMENT  — a task was assigned to a user
 *   QUOTE_APPROVAL   — a comparative quote was selected/approved
 *   DPR_APPROVAL     — a DPR needs approval / was approved
 *   PAYMENT_RECEIVED — a payment was recorded
 *   SCRAP_GENERATED  — scrap was auto-detected from DPR variance
 */

// ── Provider Interface ─────────────────────────────────────

export interface WhatsAppProvider {
  sendMessage(to: string, message: string): Promise<NotificationSendResult>;
  sendTemplateMessage?(
    to: string,
    templateName: string,
    language: string,
    components?: WhatsAppTemplateComponent[],
  ): Promise<NotificationSendResult>;
}

export interface EmailProvider {
  sendEmail(to: string, subject: string, body: string): Promise<NotificationSendResult>;
}

export interface NotificationSendResult {
  success: boolean;
  error?: string;
}

/** WhatsApp template component structure (matches Meta Cloud API) */
export interface WhatsAppTemplateComponent {
  type: "header" | "body" | "button";
  parameters?: Array<{
    type: "text" | "currency" | "date_time" | "image" | "video" | "document" | "payload";
    text?: string;
    currency?: { fallback_value: string; code: string; amount_1000: string };
    date_time?: { fallback_value: string };
    payload?: { type: string; payload?: string; url?: string };
  }>;
}

/** Stub WhatsApp provider — logs the message and returns success. */
export class StubWhatsAppProvider implements WhatsAppProvider {
  async sendMessage(to: string, message: string): Promise<NotificationSendResult> {
    console.log(`[WhatsApp Stub] To: ${to}, Message: ${message.slice(0, 100)}...`);
    return { success: true };
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    language: string,
    _components?: WhatsAppTemplateComponent[],
  ): Promise<NotificationSendResult> {
    console.log(`[WhatsApp Stub] To: ${to}, Template: ${templateName} (${language})`);
    return { success: true };
  }
}

/**
 * Cloud WhatsApp provider — uses the Meta WhatsApp Business Cloud API.
 *
 * Sends text messages and template messages via the Graph API.
 * Config: accessToken (env WHATSAPP_ACCESS_TOKEN), phoneNumberId (env
 * WHATSAPP_PHONE_NUMBER_ID), API version (default v23.0).
 *
 * Phone numbers are normalized: strip non-digits, ensure country code
 * (default +91 for India if the number has 10 digits and no prefix).
 */
export class CloudWhatsAppProvider implements WhatsAppProvider {
  private accessToken: string;
  private phoneNumberId: string;
  private apiVersion: string;
  private baseUrl: string;

  constructor(opts?: {
    accessToken?: string;
    phoneNumberId?: string;
    apiVersion?: string;
  }) {
    this.accessToken = opts?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? "";
    this.phoneNumberId = opts?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
    this.apiVersion = opts?.apiVersion ?? "v23.0";
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
  }

  /**
   * Normalize a phone number for WhatsApp Cloud API.
   * Strips non-digits. If 10 digits (Indian local), prepends 91.
   * Returns digits only (no + prefix — the API expects digits).
   */
  private normalizePhone(phone: string): string {
    let digits = phone.replace(/\D/g, "");
    // If it starts with + or 00, those are already stripped by \D
    // If 10 digits and no country code, assume India (+91)
    if (digits.length === 10) {
      digits = "91" + digits;
    }
    return digits;
  }

  private async callApi(payload: Record<string, unknown>): Promise<NotificationSendResult> {
    if (!this.accessToken || !this.phoneNumberId) {
      return { success: false, error: "WhatsApp Cloud API not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing)" };
    }

    try {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        // Handle common error codes
        const errMsg = data?.error?.message ?? `WhatsApp API error ${res.status}`;
        // Rate limit (429) — include retry info
        if (res.status === 429) {
          return { success: false, error: `WhatsApp rate limited: ${errMsg}` };
        }
        return { success: false, error: errMsg };
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "Network error contacting WhatsApp API" };
    }
  }

  async sendMessage(to: string, message: string): Promise<NotificationSendResult> {
    const normalizedTo = this.normalizePhone(to);
    return this.callApi({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedTo,
      type: "text",
      text: { body: message },
    });
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    language: string,
    components?: WhatsAppTemplateComponent[],
  ): Promise<NotificationSendResult> {
    const normalizedTo = this.normalizePhone(to);
    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedTo,
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        ...(components && components.length > 0 ? { components } : {}),
      },
    };
    return this.callApi(payload);
  }
}

/**
 * Factory: returns a CloudWhatsAppProvider if WHATSAPP_ACCESS_TOKEN env is set,
 * otherwise falls back to StubWhatsAppProvider.
 */
export function createWhatsAppProvider(): WhatsAppProvider {
  if (process.env.WHATSAPP_ACCESS_TOKEN) {
    return new CloudWhatsAppProvider();
  }
  return new StubWhatsAppProvider();
}

/** Stub email provider — logs the email and returns success. */
export class StubEmailProvider implements EmailProvider {
  async sendEmail(to: string, subject: string, body: string): Promise<NotificationSendResult> {
    console.log(`[Email Stub] To: ${to}, Subject: ${subject}, Body: ${body.slice(0, 100)}...`);
    return { success: true };
  }
}

// ── Template Rendering ─────────────────────────────────────

/** Replace {{variables}} in a template string with values from the context */
export function renderTemplate(template: string, context: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = context[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

// ── Core Send Function ─────────────────────────────────────

export interface SendNotificationInput {
  companyId: string;
  eventType: string;
  channel: "WHATSAPP" | "EMAIL" | "IN_APP";
  recipient: string;
  recipientName?: string;
  subject?: string;
  message: string;
  metadata?: Record<string, unknown>;
  userId?: string;
}

/**
 * Send a notification via the appropriate channel and log it.
 */
export async function sendNotification(
  input: SendNotificationInput,
  providers?: { whatsapp?: WhatsAppProvider; email?: EmailProvider },
) {
  const whatsappProvider = providers?.whatsapp ?? createWhatsAppProvider();
  const emailProvider = providers?.email ?? new StubEmailProvider();

  // Find the active template for this event type + channel
  const template = await prisma.notificationTemplate.findFirst({
    where: {
      companyId: input.companyId,
      eventType: input.eventType,
      channel: input.channel,
      isActive: true,
    },
  });

  // Use the template if found, otherwise use the provided message
  const message = template ? renderTemplate(template.template, { recipient: input.recipientName ?? "" }) : input.message;

  // Create the log entry
  const log = await prisma.notificationLog.create({
    data: {
      companyId: input.companyId,
      templateId: template?.id ?? null,
      eventType: input.eventType,
      channel: input.channel,
      recipient: input.recipient,
      recipientName: input.recipientName ?? null,
      subject: input.subject ?? null,
      message,
      status: "PENDING",
      metadata: (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  });

  // Send via the appropriate provider
  let result: NotificationSendResult;
  try {
    if (input.channel === "WHATSAPP") {
      result = await whatsappProvider.sendMessage(input.recipient, message);
    } else if (input.channel === "EMAIL") {
      result = await emailProvider.sendEmail(input.recipient, input.subject ?? "", message);
    } else {
      // IN_APP — always succeeds (just logged)
      result = { success: true };
    }
  } catch (err: unknown) {
    result = { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }

  // Update the log with the result
  const updated = await prisma.notificationLog.update({
    where: { id: log.id },
    data: {
      status: result.success ? "SENT" : "FAILED",
      sentAt: result.success ? new Date() : null,
      errorMessage: result.error ?? null,
    },
  });

  return updated;
}

// ── Trigger Functions ──────────────────────────────────────

/**
 * Notify relevant users about low stock for a material.
 */
export async function notifyLowStock(
  companyId: string,
  material: { id: string; code: string; name: string; unit: string; totalQty: number; reorderPoint: number | null },
  recipients: Array<{ phone: string; name: string }>,
) {
  const message = `⚠️ Low Stock Alert: ${material.name} (${material.code}) — current stock: ${material.totalQty} ${material.unit}${material.reorderPoint ? `, reorder point: ${material.reorderPoint}` : ""}. Please raise a requisition.`;

  const results = [];
  for (const r of recipients) {
    const result = await sendNotification({
      companyId,
      eventType: "LOW_STOCK",
      channel: "WHATSAPP",
      recipient: r.phone,
      recipientName: r.name,
      message,
      metadata: { materialId: material.id, totalQty: material.totalQty, reorderPoint: material.reorderPoint },
    });
    results.push(result);
  }
  return results;
}

/**
 * Notify a user about a task assignment.
 */
export async function notifyTaskAssignment(
  companyId: string,
  task: { id: string; title: string; projectName?: string },
  assignee: { phone: string; name: string },
  assignedBy: string,
) {
  const message = `📋 New Task Assigned: "${task.title}"${task.projectName ? ` for ${task.projectName}` : ""}. Assigned by ${assignedBy}. Please check your task list.`;

  return sendNotification({
    companyId,
    eventType: "TASK_ASSIGNMENT",
    channel: "WHATSAPP",
    recipient: assignee.phone,
    recipientName: assignee.name,
    message,
    metadata: { taskId: task.id },
  });
}

/**
 * Notify about a quote selection/approval.
 */
export async function notifyQuoteApproval(
  companyId: string,
  quote: { id: string; vendorName: string; totalAmount: number; isCheapest: boolean },
  requisition: { id: string; number: string },
  recipients: Array<{ phone: string; name: string }>,
) {
  const message = `✅ Quote Selected for ${requisition.number}: ${quote.vendorName} — ₹${quote.totalAmount.toFixed(2)}${quote.isCheapest ? " (cheapest)" : " (override — not cheapest)"}`;

  const results = [];
  for (const r of recipients) {
    const result = await sendNotification({
      companyId,
      eventType: "QUOTE_APPROVAL",
      channel: "WHATSAPP",
      recipient: r.phone,
      recipientName: r.name,
      message,
      metadata: { quoteId: quote.id, requisitionId: requisition.id },
    });
    results.push(result);
  }
  return results;
}

// ── Template Management ────────────────────────────────────

export async function listNotificationTemplates(companyId: string) {
  return prisma.notificationTemplate.findMany({
    where: { companyId },
    orderBy: [{ eventType: "asc" }, { channel: "asc" }],
  });
}

export async function upsertNotificationTemplate(
  companyId: string,
  eventType: string,
  channel: string,
  template: string,
  isActive: boolean = true,
  userId?: string,
) {
  const t = await prisma.notificationTemplate.upsert({
    where: {
      companyId_eventType_channel: { companyId, eventType, channel },
    },
    create: { companyId, eventType, channel, template, isActive },
    update: { template, isActive },
  });

  if (userId) {
    await logAction(prisma, {
      userId,
      action: "NOTIFICATION_TEMPLATE_UPSERT",
      entityType: "NotificationTemplate",
      entityId: t.id,
      after: { eventType, channel, template },
    });
  }

  return t;
}

// ── Log Querying ───────────────────────────────────────────

export async function listNotificationLogs(
  companyId: string,
  filters?: { eventType?: string; status?: "PENDING" | "SENT" | "FAILED"; limit?: number },
) {
  return prisma.notificationLog.findMany({
    where: {
      companyId,
      ...(filters?.eventType ? { eventType: filters.eventType } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filters?.limit ?? 100,
  });
}

export async function getNotificationStats(companyId: string) {
  const [total, sent, failed, pending] = await Promise.all([
    prisma.notificationLog.count({ where: { companyId } }),
    prisma.notificationLog.count({ where: { companyId, status: "SENT" } }),
    prisma.notificationLog.count({ where: { companyId, status: "FAILED" } }),
    prisma.notificationLog.count({ where: { companyId, status: "PENDING" } }),
  ]);

  return { total, sent, failed, pending };
}
