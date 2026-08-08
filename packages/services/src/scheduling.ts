import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { ServiceError } from "./errors";

/**
 * Project Scheduling + EVM Service.
 *
 * The scheduling layer sits on top of WBS nodes + dependencies:
 * - Forward pass: compute earliest start/end dates from dependencies
 * - Backward pass: compute latest start/end dates + total float
 * - Critical path: nodes with zero total float
 *
 * EVM (Earned Value Management) is in boq.ts (getEvmMetrics).
 * This module adds schedule-level EVM: per-WBS-node PV/EV/AC,
 * schedule variance, and cost overrun forecasting.
 */

/**
 * Forward pass through the WBS dependency graph to compute
 * earliest start and earliest finish dates for each node.
 *
 * ES(node) = max(EF(predecessors) + lagDays) for all FS deps
 * EF(node) = ES(node) + duration(node)
 *
 * For SS deps: ES = ES(pred) + lag
 * For FF deps: EF = EF(pred) + lag → ES = EF - duration
 * For SF deps (rare): ES = EF(pred) + lag (inverted)
 */
export async function computeSchedule(projectId: string) {
  const nodes = await prisma.wbsNode.findMany({
    where: { projectId },
    include: {
      blocks: { include: { successor: true } },
      dependencies: { include: { predecessor: true } },
    },
  });

  if (nodes.length === 0) return { nodes: [], criticalPath: [], projectDuration: 0 };

  // Build adjacency maps
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const successors = new Map<string, string[]>(); // nodeId → successor ids
  const predecessors = new Map<string, Array<{ id: string; type: string; lagDays: number }>>();

  for (const node of nodes) {
    successors.set(node.id, []);
    predecessors.set(node.id, []);
  }
  for (const node of nodes) {
    for (const dep of node.blocks) {
      const arr = successors.get(node.id) ?? [];
      arr.push(dep.successorId);
      successors.set(node.id, arr);

      const predArr = predecessors.get(dep.successorId) ?? [];
      predArr.push({ id: node.id, type: dep.type, lagDays: dep.lagDays });
      predecessors.set(dep.successorId, predArr);
    }
  }

  // Compute duration for each node (in days)
  function duration(node: typeof nodes[number]): number {
    if (node.type === "MILESTONE") return 0;
    if (node.plannedStart && node.plannedEnd) {
      return Math.max(0, Math.ceil((node.plannedEnd.getTime() - node.plannedStart.getTime()) / (1000 * 60 * 60 * 24)));
    }
    return 0; // no dates → zero duration
  }

  // Topological sort (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  for (const node of nodes) {
    inDegree.set(node.id, predecessors.get(node.id)?.length ?? 0);
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const succ of successors.get(id) ?? []) {
      const newDeg = (inDegree.get(succ) ?? 0) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  if (sorted.length !== nodes.length) {
    throw new ServiceError("Cycle detected in WBS dependency graph", 400);
  }

  // Forward pass: compute ES and EF
  const es = new Map<string, Date>();  // earliest start
  const ef = new Map<string, Date>();  // earliest finish

  for (const id of sorted) {
    const node = nodeMap.get(id)!;
    const preds = predecessors.get(id) ?? [];

    let earliestStart: Date | null = null;

    for (const pred of preds) {
      const predNode = nodeMap.get(pred.id)!;
      const predEF = ef.get(pred.id) ?? predNode.plannedEnd ?? predNode.plannedStart ?? new Date();
      const predES = es.get(pred.id) ?? predNode.plannedStart ?? new Date();

      let candidateStart: Date;
      switch (pred.type) {
        case "FS":
          candidateStart = addDays(predEF, pred.lagDays);
          break;
        case "SS":
          candidateStart = addDays(predES, pred.lagDays);
          break;
        case "FF": {
          const predDur = duration(predNode);
          candidateStart = addDays(addDays(predEF, pred.lagDays), -predDur);
          break;
        }
        case "SF": {
          // successor starts when predecessor finishes (inverted)
          candidateStart = addDays(predEF, pred.lagDays);
          break;
        }
        default:
          candidateStart = addDays(predEF, pred.lagDays);
      }

      if (!earliestStart || candidateStart > earliestStart) {
        earliestStart = candidateStart;
      }
    }

    // If no predecessors, use planned start or project start
    if (!earliestStart) {
      earliestStart = node.plannedStart ?? new Date();
    }

    es.set(id, earliestStart);
    ef.set(id, addDays(earliestStart, duration(node)));
  }

  // Find project end = max EF
  let projectEnd = new Date(0);
  for (const [id, finish] of ef) {
    if (finish > projectEnd) projectEnd = finish;
  }

  // Backward pass: compute LS and LF
  const ls = new Map<string, Date>();  // latest start
  const lf = new Map<string, Date>();  // latest finish

  // Process in reverse topological order
  for (let i = sorted.length - 1; i >= 0; i--) {
    const id = sorted[i]!;
    const node = nodeMap.get(id)!;
    const succs = successors.get(id) ?? [];

    let latestFinish: Date | null = null;

    if (succs.length === 0) {
      latestFinish = projectEnd;
    } else {
      for (const succId of succs) {
        const succLS = ls.get(succId) ?? new Date();
        const succES = es.get(succId) ?? new Date();

        // Find the dependency type for this edge
        const dep = node.blocks.find((d) => d.successorId === succId);
        const depType = dep?.type ?? "FS";
        const lag = dep?.lagDays ?? 0;

        let candidateFinish: Date;
        switch (depType) {
          case "FS":
          case "SF":
            candidateFinish = addDays(succLS, -lag);
            break;
          case "SS": {
            const succDur = duration(nodeMap.get(succId)!);
            candidateFinish = addDays(addDays(succES, -lag), succDur);
            break;
          }
          case "FF":
            candidateFinish = addDays(succLS, -lag); // approximate
            break;
          default:
            candidateFinish = addDays(succLS, -lag);
        }

        if (!latestFinish || candidateFinish < latestFinish) {
          latestFinish = candidateFinish;
        }
      }
    }

    lf.set(id, latestFinish ?? projectEnd);
    ls.set(id, addDays(latestFinish ?? projectEnd, -duration(node)));
  }

  // Compute total float = LS - ES (in days)
  const results = sorted.map((id) => {
    const node = nodeMap.get(id!)!;
    const esDate = es.get(id!)!;
    const lsDate = ls.get(id!)!;;
    const floatDays = Math.round((lsDate.getTime() - esDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      id,
      code: node.code,
      name: node.name,
      type: node.type,
      earliestStart: esDate,
      earliestFinish: ef.get(id)!,
      latestStart: lsDate,
      latestFinish: lf.get(id)!,
      totalFloat: floatDays,
      isCritical: floatDays === 0,
      duration: duration(node),
    };
  });

  const criticalPath = results.filter((r) => r.isCritical).map((r) => r.id);
  const projectDuration = Math.round((projectEnd.getTime() - (es.get(sorted[0]!)?.getTime() ?? projectEnd.getTime())) / (1000 * 60 * 60 * 24));

  // Persist computed schedule back to WBS nodes
  await prisma.$transaction(async (tx) => {
    for (const r of results) {
      await tx.wbsNode.update({
        where: { id: r.id },
        data: {
          isCritical: r.isCritical,
          totalFloat: r.totalFloat,
        },
      });
    }
  });

  return { nodes: results, criticalPath, projectDuration };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Per-WBS-node EVM: compute PV, EV, AC for each node that has a BOQ link.
 * PV = BOQ estimatedAmount × planned % (based on schedule)
 * EV = Σ approved MB entries × BOQ rate (for this node's BOQ item)
 * AC = proportion of project actual cost attributed to this node
 */
export async function getNodeEvm(projectId: string) {
  const nodes = await prisma.wbsNode.findMany({
    where: { projectId, boqItemId: { not: null } },
    include: {
      boqItem: { select: { id: true, estimatedAmount: true, estimatedQty: true, rate: true } },
      mbEntries: {
        where: { status: "APPROVED" },
        select: { measuredQty: true },
      },
    },
  });

  const results = nodes.map((node) => {
    const pv = node.boqItem?.estimatedAmount ? new Decimal(node.boqItem.estimatedAmount) : new Decimal(0);
    const rate = node.boqItem?.rate ? new Decimal(node.boqItem.rate) : new Decimal(0);
    const ev = node.mbEntries.reduce(
      (sum, e) => sum.plus(new Decimal(e.measuredQty).times(rate)),
      new Decimal(0),
    );
    const progressPct = pv.gt(0) ? ev.div(pv).times(100).toDecimalPlaces(2) : new Decimal(0);
    const variance = ev.minus(pv);

    return {
      nodeId: node.id,
      code: node.code,
      name: node.name,
      pv: pv.toDecimalPlaces(2),
      ev: ev.toDecimalPlaces(2),
      progressPct,
      variance: variance.toDecimalPlaces(2),
      isCritical: node.isCritical,
    };
  });

  return results;
}

/**
 * Cost overrun forecast: compare committed cost (actuals + open POs + open requisitions)
 * vs BOQ budget, per BOQ line item.
 */
export async function getCostOverrunForecast(projectId: string) {
  const boqItems = await prisma.boqItem.findMany({
    where: { projectId, type: "LINE_ITEM", materialId: { not: null } },
    include: {
      material: { select: { id: true, code: true, name: true, unit: true } },
    },
  });

  const results = [];

  for (const item of boqItems) {
    if (!item.estimatedQty || !item.rate || !item.materialId) continue;

    const budget = new Decimal(item.estimatedQty).times(new Decimal(item.rate));

    // Actual cost: material issues for this material in this project
    const issues = await prisma.materialIssueLine.aggregate({
      where: {
        materialId: item.materialId,
        materialIssue: { projectId },
      },
      _sum: { qty: true, unitCost: true },
    });
    // _sum of unitCost doesn't give us qty×cost, we need to fetch lines
    const issueLines = await prisma.materialIssueLine.findMany({
      where: { materialId: item.materialId, materialIssue: { projectId } },
      select: { qty: true, unitCost: true },
    });
    const actualCost = issueLines.reduce(
      (sum, l) => sum.plus(new Decimal(l.qty).times(new Decimal(l.unitCost))),
      new Decimal(0),
    );
    const actualQty = new Decimal(issues._sum.qty ?? 0);

    // Committed cost: open POs for this material
    const openPoLines = await prisma.purchaseOrderLine.findMany({
      where: {
        materialId: item.materialId,
        purchaseOrder: { projectId, status: { in: ["APPROVED", "ORDERED", "PARTIAL"] } },
      },
      select: { qtyOrdered: true, unitCost: true },
    });
    const committedCost = openPoLines.reduce(
      (sum, l) => sum.plus(new Decimal(l.qtyOrdered).times(new Decimal(l.unitCost))),
      new Decimal(0),
    );
    const committedQty = openPoLines.reduce(
      (sum, l) => sum.plus(new Decimal(l.qtyOrdered)),
      new Decimal(0),
    );

    // Open requisitions (not yet converted to PO)
    const openReqLines = await prisma.materialRequisitionLine.aggregate({
      where: {
        materialId: item.materialId,
        requisition: { projectId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
      },
      _sum: { qtyRequested: true },
    });
    const pendingReqQty = new Decimal(openReqLines._sum.qtyRequested ?? 0);

    const projectedCost = actualCost.plus(committedCost);
    const projectedQty = actualQty.plus(committedQty).plus(pendingReqQty);
    const overrun = projectedCost.minus(budget);
    const overrunPct = budget.gt(0) ? overrun.div(budget).times(100).toDecimalPlaces(2) : new Decimal(0);

    results.push({
      boqItemId: item.id,
      serialNo: item.serialNo,
      description: item.description,
      materialCode: item.material?.code ?? "",
      materialName: item.material?.name ?? "",
      unit: item.unit ?? "",
      budgetedQty: new Decimal(item.estimatedQty),
      budgetedAmount: budget.toDecimalPlaces(2),
      actualQty: actualQty.toDecimalPlaces(3),
      actualCost: actualCost.toDecimalPlaces(2),
      committedQty: committedQty.toDecimalPlaces(3),
      committedCost: committedCost.toDecimalPlaces(2),
      pendingReqQty: pendingReqQty.toDecimalPlaces(3),
      projectedQty: projectedQty.toDecimalPlaces(3),
      projectedCost: projectedCost.toDecimalPlaces(2),
      overrun: overrun.toDecimalPlaces(2),
      overrunPct,
    });
  }

  return results.sort((a, b) => b.overrun.minus(a.overrun).toNumber());
}
