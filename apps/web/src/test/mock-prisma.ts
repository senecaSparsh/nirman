/**
 * Mock Prisma client factory for API route + page tests.
 *
 * Usage:
 *   const prisma = createMockPrisma();
 *   prisma.material.findMany.mockResolvedValue([...]);
 *   vi.mock("@nirman/db", () => ({ prisma, Prisma: { PrismaClientKnownRequestError: class {} } }));
 *
 * The mock supports the full chainable query builder pattern:
 *   prisma.material.findMany({ where, include, ... })
 *   prisma.material.findUnique({ where, ... })
 *   prisma.material.create({ data })
 *   prisma.material.update({ where, data })
 *   prisma.material.delete({ where })
 *   prisma.material.count({ where })
 *   prisma.material.upsert({ where, create, update })
 *
 * For nested relation filters inside `where` (e.g. `location: { companyId }`),
 * the mock ignores the where clause entirely — it just returns whatever you
 * set with `.mockResolvedValue()`. This is intentional: tests should assert
 * on the *response shape*, not re-implement Prisma's query engine.
 */
import { vi, type Mock } from "vitest";

type PrismaDelegate = {
  findMany: Mock;
  findUnique: Mock;
  findFirst: Mock;
  create: Mock;
  createMany: Mock;
  update: Mock;
  updateMany: Mock;
  upsert: Mock;
  delete: Mock;
  deleteMany: Mock;
  count: Mock;
  aggregate: Mock;
  groupBy: Mock;
};

function createDelegate(): PrismaDelegate {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    upsert: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({}),
    groupBy: vi.fn().mockResolvedValue([]),
  };
}

export type MockPrisma = {
  $transaction: Mock;
  $queryRaw: Mock;
  $executeRaw: Mock;
  $connect: Mock;
  $disconnect: Mock;
} & Record<string, PrismaDelegate>;

/**
 * Create a mock Prisma client. Pass a list of model names to pre-create
 * delegates; any model accessed that wasn't pre-created is auto-created on
 * first access via a Proxy so `prisma.someNewModel.findMany` never throws.
 */
export function createMockPrisma(models: string[] = []): MockPrisma {
  const delegates: Record<string, PrismaDelegate> = {};
  for (const m of models) delegates[m] = createDelegate();

  // The proxy must be created first so $transaction can pass *it* (not the
  // raw base) to callback functions — that way auto-created delegates are
  // visible inside transaction callbacks (e.g. tx.auditLog.create in logAction).
  const base = {
    $transaction: vi.fn(async (fnOrArray: unknown, _opts?: unknown) => {
      // Support both callback form: $transaction(async (tx) => {...}, opts)
      // and array form: $transaction([promise1, promise2], opts)
      if (typeof fnOrArray === "function") {
        // Pass the proxy (not base) so auto-created delegates are visible.
        return await (fnOrArray as (tx: MockPrisma) => unknown)(proxy);
      }
      return Promise.all(fnOrArray as Promise<unknown>[]);
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    ...delegates,
  } as MockPrisma;

  const proxy = new Proxy(base, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      // Auto-create delegate for unknown models.
      if (typeof prop === "string" && !prop.startsWith("$") && !prop.startsWith("_")) {
        const d = createDelegate();
        (target as Record<string, unknown>)[prop] = d;
        return d;
      }
      return undefined;
    },
  }) as MockPrisma;

  return proxy;
}

/** Reset all mock call counts + return values. Call in beforeEach. */
export function resetMockPrisma(prisma: MockPrisma) {
  for (const key of Object.keys(prisma)) {
    const v = (prisma as Record<string, unknown>)[key];
    if (v && typeof v === "object" && "findMany" in (v as PrismaDelegate)) {
      const d = v as PrismaDelegate;
      d.findMany.mockReset().mockResolvedValue([]);
      d.findUnique.mockReset().mockResolvedValue(null);
      d.findFirst.mockReset().mockResolvedValue(null);
      d.create.mockReset().mockResolvedValue({});
      d.createMany.mockReset().mockResolvedValue({ count: 0 });
      d.update.mockReset().mockResolvedValue({});
      d.updateMany.mockReset().mockResolvedValue({ count: 0 });
      d.upsert.mockReset().mockResolvedValue({});
      d.delete.mockReset().mockResolvedValue({});
      d.deleteMany.mockReset().mockResolvedValue({ count: 0 });
      d.count.mockReset().mockResolvedValue(0);
      d.aggregate.mockReset().mockResolvedValue({});
      d.groupBy.mockReset().mockResolvedValue([]);
    }
  }
  prisma.$transaction.mockReset();
}
