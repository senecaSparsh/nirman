import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createGatePass } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { prisma } from "@nirman/db";
import { z } from "zod";

/**
 * GET /api/gate-passes?status=PENDING&category=MANUAL&locationId=xxx
 * List gate passes for the current company, with optional filters.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.GATE_PASS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const locationId = searchParams.get("locationId");

  const where: Record<string, unknown> = { companyId: company.id };
  if (status) where.status = status;
  if (category) where.category = category;
  if (locationId) where.locationId = locationId;

  const gatePasses = await prisma.gatePass.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      lines: true,
      location: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
      exitedBy: { select: { id: true, name: true } },
    },
    take: 200,
  });

  return json({
    rows: gatePasses.map((gp) => ({
      ...gp,
      lines: gp.lines.map((l) => ({ ...l, qty: toNum(l.qty) })),
    })),
    count: gatePasses.length,
  });
});

const lineSchema = z.object({
  materialId: z.string().optional().nullable(),
  materialCode: z.string().optional().nullable(),
  materialName: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  qty: z.union([z.number(), z.string()]),
  description: z.string().optional().nullable(),
});

const createSchema = z.object({
  locationId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  category: z.enum(["MATERIAL_ISSUE", "STOCK_TRANSFER", "MATERIAL_SALE", "SUPPLIER_RETURN", "MANUAL"]),
  refType: z.string().optional().nullable(),
  refId: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1),
  vehicleNumber: z.string().optional().nullable(),
  vehicleType: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  driverPhone: z.string().optional().nullable(),
  transporterName: z.string().optional().nullable(),
  destination: z.string().optional().nullable(),
  purpose: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  autoSubmit: z.boolean().optional(),
});

/**
 * POST /api/gate-passes
 * Create a new (typically MANUAL) gate pass.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.GATE_PASS_CREATE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const gp = await createGatePass({
    companyId: company.id,
    locationId: parsed.data.locationId,
    projectId: parsed.data.projectId ?? undefined,
    category: parsed.data.category,
    refType: parsed.data.refType ?? undefined,
    refId: parsed.data.refId ?? undefined,
    lines: parsed.data.lines.map((l) => ({
      materialId: l.materialId ?? undefined,
      materialCode: l.materialCode ?? undefined,
      materialName: l.materialName ?? undefined,
      unit: l.unit ?? undefined,
      qty: l.qty,
      description: l.description ?? undefined,
    })),
    vehicleNumber: parsed.data.vehicleNumber ?? undefined,
    vehicleType: parsed.data.vehicleType ?? undefined,
    driverName: parsed.data.driverName ?? undefined,
    driverPhone: parsed.data.driverPhone ?? undefined,
    transporterName: parsed.data.transporterName ?? undefined,
    destination: parsed.data.destination ?? undefined,
    purpose: parsed.data.purpose ?? undefined,
    notes: parsed.data.notes ?? undefined,
    createdById: user.id,
    autoSubmit: parsed.data.autoSubmit,
  });

  revalidatePath("/gate-passes");
  revalidatePath("/m/gate-pass");
  return json({ id: gp.id, gatePassNumber: gp.gatePassNumber }, { status: 201 });
});
