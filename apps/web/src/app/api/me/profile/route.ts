import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, requireUser } from "@/lib/server";
import { z } from "zod";

/**
 * PATCH /api/me/profile — update the current user's profile (phone, name).
 * This is for personal settings — the user editing their own info.
 * Password changes go through Better-Auth's changePassword, not here.
 */
const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).nullable().optional(),
  image: z.string().url().nullable().optional(),
});

export const PATCH = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone;
  if (parsed.data.image !== undefined) data.image = parsed.data.image;

  if (Object.keys(data).length === 0) {
    return json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: { id: true, name: true, email: true, phone: true, image: true },
  });

  return json(updated);
});
