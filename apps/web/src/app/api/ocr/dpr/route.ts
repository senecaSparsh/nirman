import { NextRequest } from "next/server";
import { createOcrProviderFromConfig } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * POST /api/ocr/dpr
 * Extract DPR data (work type, materials, labor) from a photo.
 * The photo is sent as base64 or a URL.
 *
 * Requires DPR_SUBMIT permission (site engineers, supervisors, PMs).
 */
const bodySchema = z.object({
  base64: z.string().optional(),
  url: z.string().url().optional(),
}).refine((d) => d.base64 || d.url, {
  message: "Either base64 or url must be provided",
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.DPR_SUBMIT);
  const company = await getCompany();
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const provider = await createOcrProviderFromConfig(company.id);
  const result = await provider.extractDpr({
    base64: parsed.data.base64,
    url: parsed.data.url,
  });

  return json({ result });
});
