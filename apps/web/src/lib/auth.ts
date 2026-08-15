import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@nirman/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Let Better-Auth auto-detect baseURL from request headers (Host / X-Forwarded-Host).
  // This works on any deploy URL without needing BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL.
  // Only fall back to env vars if explicitly set.
  baseURL: process.env.BETTER_AUTH_URL ?? undefined,
  trustedOrigins: [
    "https://nirman-inventory.onrender.com",
  ],
  secret: process.env.BETTER_AUTH_SECRET ?? "build-time-fallback-not-used-at-runtime",
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "MANAGER",
        input: false,
      },
      companyId: {
        type: "string",
        required: false,
        input: false,
      },
      active: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },
  session: {
    // 1 year — users stay signed in like Google/Microsoft. The session
    // auto-renews every 7 days when the user is active, so a regularly
    // active user never has to sign in again.
    expiresIn: 60 * 60 * 24 * 365, // 365 days
    updateAge: 60 * 60 * 24 * 7, // renew every 7 days of activity
    // Cookie cache — avoids a DB lookup on every request by caching the
    // session in a signed cookie for 5 minutes. If the session is revoked
    // or expires, the cookie is invalidated automatically.
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
});

export type Session = typeof auth.$Infer.Session;
