import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

/**
 * POST /api/error-logs — batch client-side errors from the ErrorCatcher.
 *
 * Body: {
 *   errors: Array<{
 *     type: "error" | "unhandledrejection" | "console.error",
 *     message: string,
 *     filename?: string,
 *     lineno?: number,
 *     colno?: number,
 *     stack?: string,
 *     url: string,
 *     timestamp: string,
 *   }>
 * }
 *
 * Any authenticated user can submit error logs — this is a client-side
 * telemetry endpoint. The errors are stored for the DEVELOPER to review.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  let user;
  try {
    user = await requireUser();
  } catch {
    user = null;
  }

  let company;
  try {
    company = user ? await getCompany() : null;
  } catch {
    company = null;
  }

  let body: { errors?: Array<Record<string, unknown>> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.errors || !Array.isArray(body.errors) || body.errors.length === 0) {
    return json({ error: "No errors provided." }, { status: 400 });
  }

  // Cap batch size to prevent abuse
  const batch = body.errors.slice(0, 50);

  const userAgent = req.headers.get("user-agent") ?? null;

  await prisma.errorLog.createMany({
    data: batch.map((e) => ({
      userId: user?.id ?? null,
      companyId: company?.id ?? null,
      type: String(e.type ?? "error"),
      message: String(e.message ?? "Unknown error").slice(0, 2000),
      filename: e.filename ? String(e.filename).slice(0, 500) : null,
      lineno: e.lineno ? Number(e.lineno) : null,
      colno: e.colno ? Number(e.colno) : null,
      stack: e.stack ? String(e.stack).slice(0, 5000) : null,
      url: String(e.url ?? "/").slice(0, 500),
      userAgent,
    })),
  });

  return json({ status: "ok", count: batch.length }, { status: 201 });
});

/**
 * GET /api/error-logs — list error logs (DEVELOPER only).
 *
 * Query params:
 *   - type: error | unhandledrejection | console.error
 *   - limit: number (default 50, max 200)
 *   - offset: number (default 0)
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  if (user.role !== "DEVELOPER") {
    return json({ error: "Forbidden — only the developer can view error logs." }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? undefined;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50;
  const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0;

  const [errors, total] = await Promise.all([
    prisma.errorLog.findMany({
      where: type ? { type } : undefined,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
      skip: offset,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        company: { select: { id: true, name: true } },
      },
    }),
    prisma.errorLog.count({ where: type ? { type } : undefined }),
  ]);

  return json({ errors, total, limit, offset });
});
