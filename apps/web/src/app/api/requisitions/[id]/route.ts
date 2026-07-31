import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import {
  approveRequisition,
  convertRequisitionToPo,
  rejectRequisition,
  submitRequisition,
} from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, json, requirePermission, toNum } from "@/lib/server";
import { z } from "zod";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const { id } = await params;
  const req = await prisma.materialRequisition.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
        orderBy: { material: { name: "asc" } },
      },
    },
  });
  if (!req) return json({ error: "Requisition not found" }, { status: 404 });

  const lines = req.lines.map((l) => ({
    id: l.id,
    materialId: l.materialId,
    materialCode: l.material.code,
    materialName: l.material.name,
    unit: l.material.unit,
    qtyRequested: toNum(l.qtyRequested),
    notes: l.notes,
  }));

  const totalQty = lines.reduce((s, l) => s + l.qtyRequested, 0);

  return json({
    id: req.id,
    reqNumber: req.reqNumber,
    projectId: req.projectId,
    projectName: req.project.name,
    phaseId: req.phaseId,
    phaseName: req.phase?.name ?? null,
    status: req.status,
    requestDate: req.requestDate.toISOString(),
    neededByDate: req.neededByDate?.toISOString() ?? null,
    notes: req.notes,
    convertedPoId: req.convertedPoId,
    lineCount: lines.length,
    totalQty,
    createdAt: req.createdAt.toISOString(),
    lines,
  });
});

const convertSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  procurementScope: z.enum(["COMPANY", "PROJECT"]),
  destinationLocationId: z.string().min(1, "Destination location is required"),
  lineCosts: z.record(z.string(), z.coerce.number().nonnegative()),
  expectedDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  try {
    if (action === "submit") {
      const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
      await submitRequisition(id, user.id);
      return json({ ok: true });
    }
    if (action === "approve") {
      const user = await requirePermission(PERM.REQUISITION_APPROVE);
      await approveRequisition(id, user.id);
      return json({ ok: true });
    }
    if (action === "reject") {
      const user = await requirePermission(PERM.REQUISITION_APPROVE);
      await rejectRequisition(id, user.id, body?.rejectReason);
      return json({ ok: true });
    }
    if (action === "convert") {
      await requirePermission(PERM.PROCUREMENT_MANAGE);
      const parsed = convertSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
      }
      const po = await convertRequisitionToPo({
        requisitionId: id,
        supplierId: parsed.data.supplierId,
        procurementScope: parsed.data.procurementScope,
        destinationLocationId: parsed.data.destinationLocationId,
        lineCosts: parsed.data.lineCosts,
        expectedDate: parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : undefined,
        notes: parsed.data.notes ?? undefined,
      });
      return json({ ok: true, poId: po.id, poNumber: po.poNumber }, { status: 201 });
    }
    return json({ error: "Invalid action. Use submit, approve, reject, or convert." }, { status: 400 });
  } catch (err: any) {
    return json({ error: err?.message ?? "Action failed" }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const req = await prisma.materialRequisition.findUnique({ where: { id } });
  if (!req) return json({ error: "Requisition not found" }, { status: 404 });
  // Only allow deleting draft or rejected requisitions
  if (!["DRAFT", "REJECTED"].includes(req.status)) {
    return json({ error: "Only draft or rejected requisitions can be deleted" }, { status: 400 });
  }
  // Delete lines first, then the requisition
  await prisma.materialRequisitionLine.deleteMany({ where: { requisitionId: id } });
  await prisma.materialRequisition.delete({ where: { id } });
  return json({ ok: true });
});
