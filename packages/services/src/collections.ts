import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { sendNotification } from "./notifications";
import { ServiceError } from "./errors";

// ───────────────────────────────────────────────────────────
//  COLLECTIONS — allottee demand notices + RERA late interest
// ───────────────────────────────────────────────────────────

// RERA S.18 delayed-payment interest: most states prescribe SBI MCLR + 2%.
// SBI 1Y MCLR ≈ 8.65% (Oct 2025) → 10.65% p.a. Override via env per deploy.
const MCLR_RATE = new Decimal(process.env.RERA_MCLR_RATE ?? "8.65");
export const LATE_INTEREST_RATE = MCLR_RATE.plus(2); // % p.a.

export interface LateInterest {
  daysOverdue: number;
  ratePercent: string;
  principalDue: string;
  interest: string;
  totalPayable: string;
}

/**
 * Interest on an overdue installment — simple daily interest on the
 * tax-inclusive balance (the demand is on the installment total).
 * Returns null when not overdue / nothing due.
 */
export function computeLateInterest(input: {
  totalAmount: Decimal | number | string;
  paidAmount?: Decimal | number | string | null;
  dueDate: Date | string | null;
  asOf?: Date;
}): LateInterest | null {
  if (!input.dueDate) return null;
  const due = new Date(input.dueDate);
  const asOf = input.asOf ?? new Date();
  const days = Math.floor((asOf.getTime() - due.getTime()) / 86400000);
  const principal = new Decimal(input.totalAmount.toString()).minus(input.paidAmount?.toString() ?? "0");
  if (days <= 0 || principal.lte(0)) return null;
  const interest = principal.times(LATE_INTEREST_RATE).div(100).times(days).div(365).toDecimalPlaces(2);
  return {
    daysOverdue: days,
    ratePercent: LATE_INTEREST_RATE.toFixed(2),
    principalDue: principal.toFixed(2),
    interest: interest.toFixed(2),
    totalPayable: principal.plus(interest).toFixed(2),
  };
}

function inr(v: Decimal | string) {
  return `₹${new Decimal(v.toString()).toNumber().toLocaleString("en-IN")}`;
}

/**
 * Send a formal demand notice for one overdue schedule item — the
 * construction-linked-plan collection letter. Computed late interest at
 * SBI MCLR+2% is included, and the NotificationLog row is the dispatch
 * evidence (RERA-aligned audit trail: who, when, channel, amounts).
 */
export async function sendDemandNotice(scheduleItemId: string, companyId: string, userId?: string) {
  const item = await prisma.paymentScheduleItem.findFirst({
    where: {
      id: scheduleItemId,
      paymentSchedule: { assetSale: { companyId, status: { not: "CANCELLED" } } },
    },
    include: {
      paymentSchedule: {
        include: {
          assetSale: {
            include: {
              customer: { select: { id: true, name: true, phone: true, email: true } },
              landParcel: { select: { number: true } },
              builtUnit: { select: { unitNumber: true } },
            },
          },
        },
      },
    },
  });
  if (!item) throw new ServiceError("Schedule item not found", 404);
  if (item.status === "PAID" || item.status === "WAIVED" || item.status === "PENDING") {
    throw new ServiceError(`Cannot demand payment on a ${item.status.toLowerCase()} installment`, 409);
  }
  const interest = computeLateInterest({
    totalAmount: item.totalAmount,
    paidAmount: item.paidAmount,
    dueDate: item.dueDate,
  });
  // A DUE item is demandable regardless of calendar overrun — for CLP the
  // milestone completion itself triggers the demand, often before any
  // dueDate passes (interest leg is simply omitted in that case).
  const balance = new Decimal(item.totalAmount.toString()).minus(item.paidAmount?.toString() ?? "0");
  if (balance.lte(0)) throw new ServiceError("Installment is already settled", 409);

  const sale = item.paymentSchedule.assetSale;
  const customer = sale.customer;
  if (!customer) throw new ServiceError("Sale has no customer to notify", 400);
  const unit = sale.builtUnit?.unitNumber ?? sale.landParcel?.number ?? "—";
  const dueDate = item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : null;

  const message =
    `PAYMENT DEMAND NOTICE\n\n` +
    `Dear ${customer.name},\n\n` +
    `Unit: ${unit} · Sale ${sale.saleNumber}\n` +
    `Installment: ${item.description} (#${item.installmentNo})\n` +
    `Amount due: ${inr(balance)}\n` +
    (dueDate ? `Due date: ${dueDate}${interest ? ` — ${interest.daysOverdue} day(s) overdue` : ""}\n` : "") +
    (interest ? `Late interest @ ${interest.ratePercent}% p.a. (SBI MCLR + 2%): ${inr(interest.interest)}\n` : "") +
    `\nTOTAL PAYABLE: ${inr(interest ? interest.totalPayable : balance)}\n\n` +
    (interest
      ? `Please pay immediately to avoid further interest accrual.\n`
      : `Please remit at the earliest.\n`) +
    `This notice is system-generated and recorded for compliance.`;

  const recipient = customer.phone ?? customer.email;
  if (!recipient) throw new ServiceError("Customer has no phone or email on file", 400);

  const result = await sendNotification({
    companyId,
    eventType: "DEMAND_LETTER",
    channel: customer.phone ? "WHATSAPP" : "EMAIL",
    recipient,
    recipientName: customer.name,
    subject: `Payment Demand — ${unit} · ${item.description}`,
    message,
    metadata: {
      kind: "demand-letter",
      scheduleItemId: item.id,
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      customerId: customer.id,
      unit,
      ...(interest ?? {
        daysOverdue: 0, ratePercent: null, principalDue: balance.toFixed(2),
        interest: "0.00", totalPayable: balance.toFixed(2),
      }),
      sentById: userId ?? null,
    },
  });
  return {
    notificationLogId: result.id,
    ...(interest ?? {
      daysOverdue: 0, ratePercent: LATE_INTEREST_RATE.toFixed(2), principalDue: balance.toFixed(2),
      interest: "0.00", totalPayable: balance.toFixed(2),
    }),
  };
}
