import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@nirman/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Static baseURL — simplest and most reliable for single-domain deploys.
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-fallback-secret-not-for-production-use-32chars",
  // Disable rate limiting — Render's proxy doesn't forward client IP headers,
  // so Better-Auth falls back to a single shared rate-limit bucket for ALL
  // users. This causes 429s after just a few requests. With a single-client
  // app, rate limiting is unnecessary.
  rateLimit: {
    enabled: false,
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Password reset flow. In dev (no email provider), the reset URL is
    // logged to the server console. In production, wire an email provider
    // (Resend/SES/SendGrid) to actually send the link.
    sendResetPassword: async ({ user, url }) => {
      if (process.env.NODE_ENV !== "production") {
        console.log(`[Password Reset] ${user.email} → ${url}`);
        return;
      }
      // TODO: wire an email provider in production.
      // For now, log so the admin can forward the link manually.
      console.log(`[Password Reset] ${user.email} → ${url}`);
    },
    // Revoke all other sessions when a password is reset (security best practice).
    revokeSessionsOnPasswordReset: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "PROJECT_MANAGER",
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
