import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { notifyPaymentDue } from "@nirman/services";
import { emitNotificationEvent, NotificationEventType } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/payments/send-reminders
 *
 * Scans for pending payments across sales, land purchases, and rent
 * agreements that are due within the next 7 days (or overdue) and
 * sends email/SMS reminders to the relevant parties.
 *
 * Body (optional):
 *  - type: "SALE" | "LAND" | "RENT" | "ALL" (default: ALL)
 *  - daysAhead: number (default: 7) — include payments due within N days
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();

  const body = await req.json().catch(() => ({}));
  const type = (body as any)?.type ?? "ALL";
  const daysAhead = (body as any)?.daysAhead ?? 7;

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const reminders: { type: string; entityName: string; amount: number; dueDate: string | null; recipient: string }[] = [];

  // 1. Sale payment schedules (pending installments)
  if (type === "ALL" || type === "SALE") {
    const pendingSalePayments = await prisma.paymentScheduleItem.findMany({
      where: {
        status: "PENDING",
        dueDate: { lte: cutoff },
        paymentSchedule: {
          assetSale: { companyId: company.id, status: { not: "CANCELLED" } },
        },
      },
      include: {
        paymentSchedule: {
          include: {
            assetSale: {
              include: {
                customer: { select: { id: true, name: true, phone: true, email: true } },
              },
            },
          },
        },
      },
    });

    for (const item of pendingSalePayments) {
      const sale = item.paymentSchedule.assetSale;
      const recipients = sale.customer
        ? [{ phone: sale.customer.phone, email: sale.customer.email, name: sale.customer.name }]
        : [];
      if (recipients.length > 0) {
        await notifyPaymentDue(
          company.id,
          {
            type: "SALE",
            entityName: `Sale ${sale.saleDeedNo ?? sale.id.slice(-6)}`,
            amount: Number(item.totalAmount),
            dueDate: item.dueDate?.toISOString().slice(0, 10) ?? null,
          },
          recipients,
        );
        reminders.push({
          type: "SALE",
          entityName: `Sale ${sale.saleDeedNo ?? sale.id.slice(-6)}`,
          amount: Number(item.totalAmount),
          dueDate: item.dueDate?.toISOString().slice(0, 10) ?? null,
          recipient: sale.customer?.name ?? "Unknown",
        });
      }

      // Also emit event for internal notification
      void emitNotificationEvent({
        eventType: NotificationEventType.SALE_PAYMENT_DUE,
        companyId: company.id,
        entityType: "AssetSale",
        entityId: sale.id,
        variables: {
          customerName: sale.customer?.name ?? "Customer",
          amount: String(Number(item.totalAmount)),
          dueDate: item.dueDate?.toISOString().slice(0, 10) ?? "N/A",
        },
        timestamp: now,
      });
    }
  }

  // 2. Land purchase payment schedules (pending installments)
  if (type === "ALL" || type === "LAND") {
    const pendingLandPayments = await prisma.landPurchasePaymentScheduleItem.findMany({
      where: {
        status: "PENDING",
        dueDate: { lte: cutoff },
        paymentSchedule: {
          landPurchase: { companyId: company.id },
        },
      },
      include: {
        paymentSchedule: {
          include: {
            landPurchase: { select: { id: true, sellerName: true, sellerContact: true, location: true } },
          },
        },
      },
    });

    for (const item of pendingLandPayments) {
      const land = item.paymentSchedule.landPurchase;
      const recipients = land.sellerContact
        ? [{ phone: land.sellerContact, email: null as string | null, name: land.sellerName }]
        : [];
      if (recipients.length > 0) {
        await notifyPaymentDue(
          company.id,
          {
            type: "LAND",
            entityName: `Land: ${land.location ?? land.sellerName}`,
            amount: Number(item.amount),
            dueDate: item.dueDate?.toISOString().slice(0, 10) ?? null,
          },
          recipients,
        );
        reminders.push({
          type: "LAND",
          entityName: `Land: ${land.location ?? land.sellerName}`,
          amount: Number(item.amount),
          dueDate: item.dueDate?.toISOString().slice(0, 10) ?? null,
          recipient: land.sellerName,
        });
      }

      void emitNotificationEvent({
        eventType: NotificationEventType.LAND_PAYMENT_DUE,
        companyId: company.id,
        entityType: "LandPurchase",
        entityId: land.id,
        variables: {
          sellerName: land.sellerName,
          amount: String(Number(item.amount)),
          dueDate: item.dueDate?.toISOString().slice(0, 10) ?? "N/A",
        },
        timestamp: now,
      });
    }
  }

  // 3. Rent due reminders (active tenancies — monthly rent is due)
  if (type === "ALL" || type === "RENT") {
    const activeTenancies = await prisma.tenancy.findMany({
      where: {
        companyId: company.id,
        status: "ACTIVE",
        // Active tenancies where the end date hasn't passed yet
        endDate: { gte: now },
      },
    });

    for (const tenancy of activeTenancies) {
      const recipients = tenancy.tenantPhone || tenancy.tenantEmail
        ? [{ phone: tenancy.tenantPhone, email: tenancy.tenantEmail, name: tenancy.tenantName }]
        : [];
      if (recipients.length > 0) {
        await notifyPaymentDue(
          company.id,
          {
            type: "RENT",
            entityName: `Rent: ${tenancy.tenantName}`,
            amount: Number(tenancy.monthlyRent),
            dueDate: now.toISOString().slice(0, 10),
          },
          recipients,
        );
        reminders.push({
          type: "RENT",
          entityName: `Rent: ${tenancy.tenantName}`,
          amount: Number(tenancy.monthlyRent),
          dueDate: now.toISOString().slice(0, 10),
          recipient: tenancy.tenantName,
        });
      }

      void emitNotificationEvent({
        eventType: NotificationEventType.RENT_DUE_REMINDER,
        companyId: company.id,
        entityType: "Tenancy",
        entityId: tenancy.id,
        variables: {
          tenantName: tenancy.tenantName,
          amount: String(Number(tenancy.monthlyRent)),
          dueDate: now.toISOString().slice(0, 10),
        },
        timestamp: now,
      });
    }
  }

  return json({
    ok: true,
    remindersSent: reminders.length,
    reminders,
  });
});
