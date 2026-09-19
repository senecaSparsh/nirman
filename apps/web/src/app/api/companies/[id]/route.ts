import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, getCompanyDescendantIds, getManageableCompanyIds, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/** GET /api/companies/[id] — fetch a single company by ID */
export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const currentCompany = await getCompany();
  const { id } = await ctx.params;

  // Verify the user has access to this company (member or parent company)
  if (id !== currentCompany.id) {
    const isChild = await prisma.company.findFirst({
      where: { id, parentCompanyId: currentCompany.id, deletedAt: null },
      select: { id: true },
    });
    if (!isChild) {
      return json({ error: "Company not found" }, { status: 404 });
    }
  }

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { children: true, projects: true, stockLocations: true } },
    },
  });
  if (!company || company.deletedAt) return json({ error: "Company not found" }, { status: 404 });
  return json(company);
});

const companyUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  // Short code used in document numbers (e.g. "SRG" → PO-SRG-260914-0001).
  // Letters/digits only; stored uppercase. Uniqueness enforced by the DB.
  code: z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9]+$/, "Code must be letters/digits only").optional().nullable(),
  gstin: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  // Verified HQ geo-fence — set from the address picker; used as the fallback
  // check-in fence for employees without an assigned reporting location.
  lat: z.coerce.number().min(-90).max(90).optional().nullable(),
  lng: z.coerce.number().min(-180).max(180).optional().nullable(),
  geoRadius: z.coerce.number().int().min(10).max(50000).optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable(),
  currency: z.string().optional(),
  businessType: z.string().optional().nullable(),
  parentCompanyId: z.string().optional().nullable(),
  // Procurement config
  lciThresholdDefault: z.coerce.number().min(0).max(100).optional().nullable(),
  poApprovalThresholdManager: z.coerce.number().min(0).optional().nullable(),
  poApprovalThresholdAdmin: z.coerce.number().min(0).optional().nullable(),
  // Hours before a pending approval is "stalled" and hits the escalation
  // digest. 1–336 (2 weeks); default 48.
  approvalAgingHours: z.coerce.number().min(1).max(336).optional(),
  // ── Password policy (tenancy-level) ──
  passwordMinLength: z.coerce.number().min(4).max(128).optional(),
  passwordRequireSpecial: z.boolean().optional(),
  passwordExpiryDays: z.coerce.number().min(0).optional().nullable(),
  accountLockoutThreshold: z.coerce.number().min(1).max(50).optional(),
  accountLockoutDurationMin: z.coerce.number().min(1).max(1440).optional(),
  // ── Call recording config (retention/storage/consent; mode + per-user
  //    selection stays on /api/telephony/recording-config) ──
  recordingConsentBeep: z.boolean().optional(),
  recordingRetentionDays: z.coerce.number().min(0).optional(),
  recordingAutoDelete: z.boolean().optional(),
  recordingStorageProvider: z.string().optional(),
});

/**
 * PATCH /api/companies/[id] — update a company's profile or hierarchy.
 * Setting parentCompanyId to null detaches it from its parent. A company
 * cannot be its own parent (cycle guard).
 *
 * Security: the user must be a member of the company being modified (or
 * of its parent company, for group-level management).
 */
export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.COMPANY_MANAGE);
  const currentCompany = await getCompany();
  const { id } = await ctx.params;

  // Verify the user has access to this company (member or parent company)
  if (id !== currentCompany.id) {
    const isChild = await prisma.company.findFirst({
      where: { id, parentCompanyId: currentCompany.id, deletedAt: null },
      select: { id: true },
    });
    if (!isChild) {
      return json({ error: "Company not found" }, { status: 404 });
    }
  }

  const body = await req.json();
  const parsed = companyUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  // Cycle guard: a company cannot be its own parent.
  if (data.parentCompanyId && data.parentCompanyId === id) {
    return json({ error: "A company cannot be its own parent" }, { status: 400 });
  }
  // Validate parent exists if provided — AND that it sits inside the
  // caller's own manageable tree. Re-parenting onto another tenant's
  // company would pull this company into their group (and theirs into
  // ours) for every group-scoped query.
  if (data.parentCompanyId) {
    const parent = await prisma.company.findFirst({
      where: { id: data.parentCompanyId, deletedAt: null },
      select: { id: true },
    });
    if (!parent) return json({ error: "Parent company not found" }, { status: 400 });
    const isDevBypass = process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production" && user.id === "dev";
    if (!isDevBypass) {
      const [manageable, descendants] = await Promise.all([
        getManageableCompanyIds(user.id),
        getCompanyDescendantIds(id),
      ]);
      if (!manageable.includes(parent.id)) {
        return json({ error: "You can only attach to a company you belong to" }, { status: 403 });
      }
      if (descendants.includes(parent.id)) {
        return json({ error: "Cannot nest a company under its own descendant" }, { status: 400 });
      }
    }
  }

  if (data.code) data.code = data.code.toUpperCase();

  try {
    const updated = await prisma.company.update({
      where: { id },
      data,
      select: { id: true, name: true, code: true },
    });
    return json(updated);
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return json({ error: "That code is already used by another company" }, { status: 409 });
    }
    throw err;
  }
});

/**
 * DELETE /api/companies/[id] — soft-delete a company. OWNER/ADMIN only.
 * Refuses if the company still has children (must re-parent or delete
 * children first) so the hierarchy never has dangling references.
 *
 * Security: the user must be a member of the company (or its parent).
 */
export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const currentCompany = await getCompany();
  const { id } = await ctx.params;

  // Verify the user has access to this company
  if (id !== currentCompany.id) {
    const isChild = await prisma.company.findFirst({
      where: { id, parentCompanyId: currentCompany.id, deletedAt: null },
      select: { id: true },
    });
    if (!isChild) {
      return json({ error: "Company not found" }, { status: 404 });
    }
  }

  const existing = await prisma.company.findUnique({
    where: { id },
    select: { id: true, deletedAt: true, _count: { select: { children: true } } },
  });
  if (!existing || existing.deletedAt) {
    return json({ error: "Company not found" }, { status: 404 });
  }
  if (existing._count.children > 0) {
    return json({ error: "Re-parent or delete child companies first" }, { status: 400 });
  }

  await prisma.company.update({ where: { id }, data: { deletedAt: new Date() } });
  return json({ ok: true });
});

