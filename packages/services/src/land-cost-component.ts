import { prisma, type Prisma, type LandCostFrequency, type LandCostRecurrenceInterval } from "@nirman/db";
import Decimal from "decimal.js";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { postLandCostComponent, reverseJournalEntry } from "./gl-posting";
import { ServiceError } from "./errors";
import { withSerializableTransaction } from "./transaction";

/**
 * Land Cost Component Service — arbitrary / recurring / future costs
 * that add to a land purchase's totalCost over time.
 *
 * Mirrors the ProjectCost pattern: a flexible child model so the owner
 * can add ANY cost at ANY time (one-off EDC/IDC, a future-dated charge,
 * yearly lease rent, monthly maintenance) without bloating the fixed
 * cost-breakup columns on LandPurchase.
 *
 * Accrual model:
 *  - ONE_TIME: postedAmount = amount once startDate has elapsed (0 before).
 *  - RECURRING: postedAmount = (elapsed occurrences) × amount, where
 *    elapsed occurrences = floor((now − startDate) / interval), capped
 *    by `occurrences` (if set) and by `endDate` (if set).
 *
 * recomputeLandTotalCost() advances postedAmount as time passes, posts
 * the GL delta for each accrual, updates LandPurchase.totalCost, reprices
 * parcel acquisitionCost pro-rata, and re-runs project cost reallocation.
 */

const INTERVAL_MS: Record<LandCostRecurrenceInterval, number> = {
  MONTHLY: 30 * 24 * 60 * 60 * 1000,
  QUARTERLY: 90 * 24 * 60 * 60 * 1000,
  HALF_YEARLY: 182 * 24 * 60 * 60 * 1000,
  YEARLY: 365 * 24 * 60 * 60 * 1000,
};

export interface LandCostComponentData {
  id: string;
  landPurchaseId: string;
  label: string;
  amount: Decimal;
  frequency: LandCostFrequency;
  interval: LandCostRecurrenceInterval | null;
  startDate: Date;
  endDate: Date | null;
  occurrences: number | null;
  postedAmount: Decimal;
  notes: string | null;
}

/**
 * Pure helper — compute the amount that should be incurred/capitalised
 * for a component as of a given moment. Stateless; does not touch the DB.
 *
 * ONE_TIME:
 *   - startDate <= asOf → full amount (a future-dated charge returns 0
 *     until its date arrives).
 * RECURRING:
 *   - elapsed = floor((asOf − startDate) / intervalMs)
 *   - capped by `occurrences` if set, and by `endDate` if set
 *     (no occurrence starts after endDate)
 *   - postedAmount = elapsed × amount
 */
export function effectivePostedAmount(
  component: {
    amount: Decimal | number | string;
    frequency: LandCostFrequency;
    interval: LandCostRecurrenceInterval | null;
    startDate: Date;
    endDate: Date | null;
    occurrences: number | null;
  },
  asOf: Date = new Date(),
): Decimal {
  const amount = new Decimal(component.amount);
  const start = component.startDate.getTime();

  if (component.frequency === "ONE_TIME") {
    return asOf.getTime() >= start ? amount : new Decimal(0);
  }

  // RECURRING
  if (!component.interval) return new Decimal(0);
  const intervalMs = INTERVAL_MS[component.interval];
  if (asOf.getTime() < start) return new Decimal(0);

  let elapsed = Math.floor((asOf.getTime() - start) / intervalMs) + 1; // +1: startDate itself is occurrence #1

  // Cap by endDate — an occurrence only counts if it starts on/before endDate.
  if (component.endDate) {
    const endMs = component.endDate.getTime();
    const occurrencesBeforeEnd = Math.floor((endMs - start) / intervalMs) + 1;
    elapsed = Math.min(elapsed, Math.max(0, occurrencesBeforeEnd));
  }
  // Cap by fixed occurrence count.
  if (component.occurrences != null) {
    elapsed = Math.min(elapsed, component.occurrences);
  }
  if (elapsed < 0) elapsed = 0;
  return amount.times(elapsed);
}

/**
 * Total scheduled commitment for a component — the full future value
 * (what will eventually be incurred), for display alongside postedAmount.
 * ONE_TIME: amount. RECURRING: occurrences (or endDate-derived count) × amount.
 */
export function scheduledTotal(
  component: {
    amount: Decimal | number | string;
    frequency: LandCostFrequency;
    interval: LandCostRecurrenceInterval | null;
    startDate: Date;
    endDate: Date | null;
    occurrences: number | null;
  },
): Decimal {
  const amount = new Decimal(component.amount);
  if (component.frequency === "ONE_TIME") return amount;
  if (!component.interval) return amount;
  if (component.occurrences != null) return amount.times(component.occurrences);
  if (component.endDate) {
    const intervalMs = INTERVAL_MS[component.interval];
    const count = Math.floor((component.endDate.getTime() - component.startDate.getTime()) / intervalMs) + 1;
    return amount.times(Math.max(0, count));
  }
  // Indefinite recurring with no end — commitment is open-ended; return 0
  // to signal "ongoing" rather than a finite number the UI might misrepresent.
  return new Decimal(0);
}

interface AddLandCostComponentInput {
  landPurchaseId: string;
  label: string;
  amount: Decimal | number | string;
  frequency?: LandCostFrequency;
  interval?: LandCostRecurrenceInterval | null;
  startDate?: Date;
  endDate?: Date | null;
  occurrences?: number | null;
  notes?: string;
  userId?: string;
}

export async function addLandCostComponent(input: AddLandCostComponentInput) {
  const amount = new Decimal(input.amount);
  if (!amount.gt(0)) throw new ServiceError("Cost amount must be > 0");
  if (!input.label?.trim()) throw new ServiceError("Label is required");
  if (input.frequency === "RECURRING" && !input.interval) {
    throw new ServiceError("Interval is required for recurring costs");
  }
  if (input.endDate && input.startDate && input.endDate.getTime() < input.startDate.getTime()) {
    throw new ServiceError("End date cannot be before start date");
  }
  if (input.occurrences != null && input.occurrences <= 0) {
    throw new ServiceError("Occurrences must be > 0");
  }

  return withSerializableTransaction(async (tx) => {
    const lp = await tx.landPurchase.findFirst({
      where: { id: input.landPurchaseId, deletedAt: null },
    });
    if (!lp) throw new ServiceError("Land purchase not found or deleted", 404);

    const component = await tx.landCostComponent.create({
      data: {
        landPurchaseId: input.landPurchaseId,
        label: input.label.trim(),
        amount,
        frequency: input.frequency ?? "ONE_TIME",
        interval: input.interval ?? null,
        startDate: input.startDate ?? new Date(),
        endDate: input.endDate ?? null,
        occurrences: input.occurrences ?? null,
        notes: input.notes ?? null,
        createdById: input.userId ?? null,
      },
    });

    await logAction(tx, {
      userId: input.userId,
      action: "LAND_COST_COMPONENT_ADD",
      entityType: "LandCostComponent",
      entityId: component.id,
      after: { landPurchaseId: input.landPurchaseId, label: component.label, amount: amount.toString(), frequency: component.frequency },
    });

    await recomputeLandTotalCost(tx, input.landPurchaseId, input.userId);
    return component;
  });
}

interface UpdateLandCostComponentInput {
  label?: string;
  amount?: Decimal | number | string;
  frequency?: LandCostFrequency;
  interval?: LandCostRecurrenceInterval | null;
  startDate?: Date;
  endDate?: Date | null;
  occurrences?: number | null;
  notes?: string | null;
  userId?: string;
}

export async function updateLandCostComponent(id: string, input: UpdateLandCostComponentInput) {
  return withSerializableTransaction(async (tx) => {
    const existing = await tx.landCostComponent.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("Cost component not found", 404);

    const data: Prisma.LandCostComponentUpdateInput = {};
    if (input.label !== undefined) {
      if (!input.label?.trim()) throw new ServiceError("Label cannot be empty");
      data.label = input.label.trim();
    }
    if (input.amount !== undefined) {
      const amt = new Decimal(input.amount);
      if (!amt.gt(0)) throw new ServiceError("Cost amount must be > 0");
      data.amount = amt;
    }
    if (input.frequency !== undefined) data.frequency = input.frequency;
    if (input.interval !== undefined) data.interval = input.interval;
    if (input.startDate !== undefined) data.startDate = input.startDate;
    if (input.endDate !== undefined) data.endDate = input.endDate;
    if (input.occurrences !== undefined) {
      if (input.occurrences != null && input.occurrences <= 0) {
        throw new ServiceError("Occurrences must be > 0");
      }
      data.occurrences = input.occurrences;
    }
    if (input.notes !== undefined) data.notes = input.notes;

    // Validate consistency after merge.
    const freq = (data.frequency ?? existing.frequency) as LandCostFrequency;
    const interval = (data.interval ?? existing.interval) as LandCostRecurrenceInterval | null;
    if (freq === "RECURRING" && !interval) {
      throw new ServiceError("Interval is required for recurring costs");
    }
    const start = (data.startDate ?? existing.startDate) as Date;
    const end = (data.endDate === undefined ? existing.endDate : data.endDate) as Date | null;
    if (end && start && end.getTime() < start.getTime()) {
      throw new ServiceError("End date cannot be before start date");
    }

    const updated = await tx.landCostComponent.update({ where: { id }, data });

    await logAction(tx, {
      userId: input.userId,
      action: "LAND_COST_COMPONENT_UPDATE",
      entityType: "LandCostComponent",
      entityId: id,
      before: { label: existing.label, amount: existing.amount.toString(), frequency: existing.frequency },
      after: { label: updated.label, amount: updated.amount.toString(), frequency: updated.frequency },
    });

    await recomputeLandTotalCost(tx, existing.landPurchaseId, input.userId);
    return updated;
  });
}

export async function deleteLandCostComponent(id: string, userId?: string) {
  return withSerializableTransaction(async (tx) => {
    const component = await tx.landCostComponent.findUnique({ where: { id } });
    if (!component) throw new ServiceError("Cost component not found", 404);

    // Reverse every GL entry this component posted.
    const entries = await tx.journalEntry.findMany({
      where: { sourceType: "LAND_COST_COMPONENT", sourceId: id },
    });
    for (const entry of entries) {
      await reverseJournalEntry(tx, entry.id, {
        postedById: userId,
        memo: `Reversal: land cost component deleted (${component.label})`,
      });
    }

    await tx.landCostComponent.delete({ where: { id } });

    await logAction(tx, {
      userId,
      action: "LAND_COST_COMPONENT_DELETE",
      entityType: "LandCostComponent",
      entityId: id,
      before: { landPurchaseId: component.landPurchaseId, label: component.label, amount: component.amount.toString() },
    });

    await recomputeLandTotalCost(tx, component.landPurchaseId, userId, { zeroDeletedComponent: component.id });
    return { deleted: true, landPurchaseId: component.landPurchaseId };
  });
}

/**
 * The "gets updated" engine. Recomputes LandPurchase.totalCost from the
 * fixed cost-breakup columns + Σ effectivePostedAmount(components), posts
 * the GL delta for each component whose postedAmount advanced, reprices
 * parcel acquisitionCost pro-rata, and re-runs project reallocation.
 *
 * Idempotent: if nothing changed, it writes nothing (apart from a no-op
 * totalCost update to the same value, which Prisma skips when unchanged).
 *
 * Pass `opts.zeroDeletedComponent` when called from deleteLandCostComponent
 * so the just-deleted component is excluded from the sum (it's already gone
 * from the DB, but the GL entries were reversed above so we must not
 * re-post its delta).
 */
export async function recomputeLandTotalCost(
  tx: Prisma.TransactionClient,
  landPurchaseId: string,
  userId?: string,
  opts: { zeroDeletedComponent?: string } = {},
) {
  const lp = await tx.landPurchase.findFirst({
    where: { id: landPurchaseId, deletedAt: null },
    include: {
      costComponents: true,
      parcels: { where: { deletedAt: null, parentParcelId: null } },
    },
  });
  if (!lp) throw new ServiceError("Land purchase not found", 404);

  const now = new Date();
  const fixedCols: Decimal = [
    lp.baseCost, lp.leaseRentAmount, lp.gstAmount,
    lp.registrationAmount, lp.stampDutyAmount, lp.transferDutyAmount,
    lp.brokerageAmount, lp.legalFees, lp.otherCharges,
  ].reduce<Decimal>((sum, v) => sum.plus(v ? new Decimal(v) : new Decimal(0)), new Decimal(0));

  let componentsTotal = new Decimal(0);
  for (const c of lp.costComponents) {
    if (opts.zeroDeletedComponent === c.id) continue;
    const effective = effectivePostedAmount(c, now);
    componentsTotal = componentsTotal.plus(effective);

    const currentPosted = new Decimal(c.postedAmount);
    const delta = effective.minus(currentPosted);
    if (!delta.eq(0)) {
      // Post the delta to GL (positive = accrual, negative = reversal handled
      // by caller for deletes; here a negative delta means the schedule was
      // edited down, so we reverse the most recent entries).
      if (delta.gt(0)) {
        await postLandCostComponent(tx, {
          companyId: lp.companyId,
          landCostComponentId: c.id,
          landPurchaseId: landPurchaseId,
          amount: delta,
          postedById: userId,
        });
      } else {
        // delta < 0: reverse entries to bring postedAmount down.
        const toReverse = currentPosted.minus(effective);
        const entries = await tx.journalEntry.findMany({
          where: { sourceType: "LAND_COST_COMPONENT", sourceId: c.id },
          include: { lines: true },
          orderBy: { entryDate: "desc" },
        });
        let remaining = toReverse;
        for (const entry of entries) {
          if (remaining.lte(0)) break;
          const entryTotal = entry.lines.reduce(
            (s, l) => s.plus(new Decimal(l.debit)), new Decimal(0),
          );
          await reverseJournalEntry(tx, entry.id, {
            postedById: userId,
            memo: `Reversal: land cost component schedule reduced (${c.label})`,
          });
          remaining = remaining.minus(entryTotal);
        }
      }
      await tx.landCostComponent.update({
        where: { id: c.id },
        data: { postedAmount: effective },
      });
    }
  }

  const newTotal = fixedCols.plus(componentsTotal);
  const oldTotalStr = lp.totalCost.toString();
  const newTotalStr = newTotal.toFixed(2);

  if (newTotalStr !== oldTotalStr) {
    await tx.landPurchase.update({
      where: { id: landPurchaseId },
      data: { totalCost: newTotal },
    });

    // Reprice parcel acquisitionCost pro-rata (WHOLE vs SUBDIVIDED).
    const rootParcel = lp.parcels.find((p) => p.parentParcelId === null);
    if (rootParcel && rootParcel.status !== "PARTITIONED") {
      await tx.landParcel.update({
        where: { id: rootParcel.id },
        data: { acquisitionCost: newTotal },
      });
    } else {
      // Only reprice leaf parcels (parcels with no children of their own)
      // to avoid double-counting intermediate parents that are themselves PARTITIONED
      const childParcels = await tx.landParcel.findMany({
        where: { landPurchaseId, deletedAt: null, parentParcelId: { not: null }, children: { none: {} } },
      });
      const totalChildArea = childParcels.reduce((s, p) => s.plus(new Decimal(p.area)), new Decimal(0));
      if (totalChildArea.gt(0)) {
        for (const child of childParcels) {
          const share = new Decimal(child.area).div(totalChildArea);
          await tx.landParcel.update({
            where: { id: child.id },
            data: { acquisitionCost: newTotal.times(share) },
          });
        }
      }
    }

    // Re-run project cost reallocation if linked (reads totalCost automatically).
    if (lp.projectId) {
      await reallocateProjectCosts(tx, lp.projectId);
    }

    await logAction(tx, {
      userId,
      action: "LAND_COST_RECOMPUTE",
      entityType: "LandPurchase",
      entityId: landPurchaseId,
      before: { totalCost: oldTotalStr },
      after: { totalCost: newTotalStr, componentsTotal: componentsTotal.toString() },
    });
  }

  return { totalCost: newTotal, componentsTotal };
}

/**
 * Public entry point to trigger a recompute from outside a transaction
 * (e.g. on view, or a scheduled job). Opens its own transaction.
 */
export async function refreshLandTotalCost(landPurchaseId: string, userId?: string) {
  return withSerializableTransaction(async (tx) =>
    recomputeLandTotalCost(tx, landPurchaseId, userId),
  );
}
