import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { searchVehicles, listVehicles, createVehicle } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, requireUser } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * GET /api/vehicles?q=MH-12 — search vehicles by number (autocomplete)
 * GET /api/vehicles — list all vehicles for the company
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const company = await getCompany();
  const q = req.nextUrl.searchParams.get("q");

  if (q) {
    const results = await searchVehicles(company.id, q);
    return json(results);
  }

  const vehicles = await listVehicles(company.id);
  return json(vehicles);
});

const createSchema = z.object({
  vehicleNumber: z.string().min(1, "Vehicle number is required").max(60),
  vehicleType: z
    .enum([
      "TRUCK", "TEMPO", "PICKUP", "TRACTOR", "MINI_TRUCK",
      "AUTO", "CAR", "BIKE", "CYCLE", "HAND_CART", "PORTER", "OTHER",
    ])
    .default("OTHER"),
  photoUrl: z.string().url().nullable().optional(),
  driverName: z.string().max(120).nullable().optional(),
  driverPhone: z.string().max(40).nullable().optional(),
  transporterName: z.string().max(160).nullable().optional(),
});

/**
 * POST /api/vehicles — manually create a Vehicle master record.
 *
 * Vehicles normally auto-build from goods movements, but the owner can
 * pre-register a vehicle before its first trip. (vehicleNumber, companyId)
 * is unique — duplicates return 409.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.VEHICLE_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const vehicle = await createVehicle({
      companyId: company.id,
      vehicleNumber: parsed.data.vehicleNumber,
      vehicleType: parsed.data.vehicleType,
      photoUrl: parsed.data.photoUrl ?? null,
      driverName: parsed.data.driverName ?? null,
      driverPhone: parsed.data.driverPhone ?? null,
      transporterName: parsed.data.transporterName ?? null,
    });
    revalidatePath("/vehicles");
    revalidatePath("/m/vehicles");
    return json(vehicle, { status: 201 });
  } catch (err) {
    // Prisma unique-constraint violation → friendly message
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return json(
        { error: `A vehicle with number "${parsed.data.vehicleNumber.trim().toUpperCase()}" already exists` },
        { status: 409 },
      );
    }
    throw err;
  }
});
