import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";
import { z } from "zod";

/**
 * GET /api/vehicles/[id] — fetch a single vehicle by ID (with trip count)
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const company = await getCompany();
  const { id } = await params;
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!vehicle) return json({ error: "Vehicle not found" }, { status: 404 });
  return json(vehicle);
});

const updateSchema = z.object({
  driverName: z.string().optional().nullable(),
  driverPhone: z.string().optional().nullable(),
  transporterName: z.string().optional().nullable(),
  vehicleType: z.string().min(1).optional(),
  photoUrl: z.string().optional().nullable(),
});

/**
 * PATCH /api/vehicles/[id] — update vehicle master fields
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Verify the vehicle belongs to the user's company
  const existing = await prisma.vehicle.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return json({ error: "Vehicle not found" }, { status: 404 });

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data: {
      driverName: parsed.data.driverName,
      driverPhone: parsed.data.driverPhone,
      transporterName: parsed.data.transporterName,
      vehicleType: parsed.data.vehicleType,
      photoUrl: parsed.data.photoUrl,
    },
  });
  return json(vehicle);
});
