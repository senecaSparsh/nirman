/**
 * Auth + Prisma mocking helpers for API route + page tests.
 *
 * ## Why this design
 * `vi.mock()` factories are hoisted by vitest to the top of the test file,
 * BEFORE any `let`/`const` initializations and BEFORE imports resolve. So:
 *  - The factory cannot close over mutable `let` state in the test file.
 *  - The factory CAN read from a module-level object's properties at *call time*
 *    (the object reference is stable; its properties are read when the mock fn
 *    is invoked, which is during the test, after setSessionUser() ran).
 *
 * We use `vi.hoisted()` to create the state holder so it's available even to
 * hoisted mock factories. Test files call `vi.mock` at their top level using
 * the exported factory functions.
 *
 * ## Usage (in a test file)
 * ```ts
 * import { describe, it, expect, beforeEach } from "vitest";
 * import { authMocks, setSessionUser, makeRequest, getJson, mockPrisma } from "@/test/mock-auth";
 *
 * // Top-level — these are hoisted by vitest:
 * vi.mock("@/lib/auth", () => authMocks.authFactory());
 * vi.mock("@nirman/db", () => authMocks.dbFactory());
 *
 * import { GET, POST } from "./route";  // imports AFTER vi.mock
 *
 * beforeEach(() => setSessionUser({ role: "OWNER" }));
 * ```
 */
import { vi } from "vitest";
import type { NextRequest } from "next/server";
import type { Role } from "@/lib/roles";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string | null;
  active: boolean;
}

export interface FakeCompany {
  id: string;
  name: string;
  currency: string;
  parentCompanyId: string | null;
  deletedAt: Date | null;
}

// vi.hoisted() runs BEFORE any other code in the module (including const
// initializers), so the defaults must be inlined inside the hoisted callback.
// The object reference is stable; properties are mutated by setSessionUser()/
// setCompany() and read at mock-call-time inside the vi.mock factories.
const state = vi.hoisted(() => {
  const defaultUser = {
    id: "user-owner-1",
    email: "owner@test.com",
    name: "Test Owner",
    role: "OWNER",
    companyId: "company-1",
    active: true,
  } as SessionUser;
  const defaultCompany = {
    id: "company-1",
    name: "Test Company",
    currency: "INR",
    parentCompanyId: null,
    deletedAt: null,
  } as FakeCompany;
  return {
    user: { ...defaultUser } as SessionUser,
    company: { ...defaultCompany } as FakeCompany,
    sessionUser: { ...defaultUser } as SessionUser | null,
    prisma: null as import("./mock-prisma").MockPrisma | null,
    defaultUser,
    defaultCompany,
  };
});

const DEFAULT_USER: SessionUser = state.defaultUser;
const DEFAULT_COMPANY: FakeCompany = state.defaultCompany;

/** Override the session user for subsequent requests. Pass `null` to simulate logged-out. */
export function setSessionUser(overrides: Partial<SessionUser> = {}) {
  state.sessionUser = { ...DEFAULT_USER, ...overrides };
  state.user = state.sessionUser;
}

/** Simulate a logged-out state (no session). */
export function clearSession() {
  state.sessionUser = null;
}

/** Override the active company for subsequent requests. */
export function setCompany(overrides: Partial<FakeCompany> = {}) {
  state.company = { ...DEFAULT_COMPANY, ...overrides };
}

/** Reset to defaults (call in beforeEach). */
export function resetAuth() {
  state.user = { ...DEFAULT_USER };
  state.company = { ...DEFAULT_COMPANY };
  state.sessionUser = { ...DEFAULT_USER };
}

export function getSessionUser(): SessionUser | null {
  return state.sessionUser;
}

/**
 * The mock prisma instance, exposed so tests can configure delegates
 * (e.g. `mockPrisma.material.findMany.mockResolvedValue([...])`).
 * Populated after dbFactory() runs. Access via `mockPrisma` getter.
 */
export function mockPrisma(): import("./mock-prisma").MockPrisma {
  return state.prisma!;
}

/** Mock factory for @/lib/auth. Reads state.sessionUser at call-time. */
function authFactory() {
  return {
    auth: {
      api: {
        getSession: vi.fn(async () => {
          if (!state.sessionUser) return null;
          return {
            user: state.sessionUser,
            session: {
              id: "session-1",
              userId: state.sessionUser.id,
              expiresAt: new Date(Date.now() + 86400000),
            },
          };
        }),
      },
    },
  };
}

/** Mock factory for @nirman/db. Wires user/company delegates to state. */
async function dbFactory() {
  const { createMockPrisma } = await import("./mock-prisma");
  const prisma = createMockPrisma([
    "user",
    "company",
    "userCompany",
    "userScope",
    "projectAssignment",
    "roleOverride",
    "userPermissionOverride",
  ]);
  // getCurrentUser() calls prisma.user.findUnique({ where: { id } })
  prisma.user!.findUnique.mockImplementation(async () => {
    if (!state.sessionUser) return null;
    return {
      id: state.sessionUser.id,
      role: state.sessionUser.role,
      companyId: state.sessionUser.companyId,
      active: state.sessionUser.active,
    };
  });
  // getCompany() calls prisma.company.findFirst
  prisma.company!.findFirst.mockImplementation(async () => state.company);
  prisma.company!.findMany.mockResolvedValue([]);
  prisma.userCompany!.findFirst.mockResolvedValue(null);
  // getUserPermissions() calls userCompany.findUnique with userId_companyId
  // and reads .userPermissions.map(...). Must include userPermissions: [].
  prisma.userCompany!.findUnique.mockResolvedValue({ id: "uc-1", role: "OWNER", userPermissions: [] });
  prisma.userScope!.findFirst.mockResolvedValue(null);
  prisma.projectAssignment!.findMany.mockResolvedValue([]);
  prisma.roleOverride!.findMany.mockResolvedValue([]);
  prisma.userPermissionOverride!.findMany.mockResolvedValue([]);

  state.prisma = prisma;

  return {
    prisma,
    Prisma: {
      PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
        code: string;
        meta?: Record<string, unknown>;
        clientVersion: string;
        constructor(
          message: string,
          { code, clientVersion = "6.0.0" }: { code: string; clientVersion?: string; meta?: Record<string, unknown> },
        ) {
          super(message);
          this.name = "PrismaClientKnownRequestError";
          this.code = code;
          this.clientVersion = clientVersion;
        }
      },
      PrismaClientUnknownRequestError: class PrismaClientUnknownRequestError extends Error {
        clientVersion: string;
        constructor(message: string, { clientVersion = "6.0.0" }: { clientVersion?: string }) {
          super(message);
          this.name = "PrismaClientUnknownRequestError";
          this.clientVersion = clientVersion;
        }
      },
      PrismaClientInitializationError: class PrismaClientInitializationError extends Error {
        clientVersion: string;
        constructor(message: string, { clientVersion = "6.0.0" }: { clientVersion?: string }) {
          super(message);
          this.name = "PrismaClientInitializationError";
          this.clientVersion = clientVersion;
        }
      },
    },
  };
}

/** Exported factories for use in test files' top-level vi.mock() calls. */
export const authMocks = {
  authFactory,
  dbFactory,
};

/**
 * Build a Request object for testing API routes.
 * Returns NextRequest (via cast) since route handlers expect NextRequest.
 */
export function makeRequest(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): NextRequest {
  const { method = "GET", body, headers = {} } = init;
  const req = new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  return req as unknown as NextRequest;
}

/** Extract JSON body from a Response. */
export async function getJson<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
