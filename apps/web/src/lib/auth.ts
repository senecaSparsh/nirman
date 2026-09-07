import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { passkey } from "@better-auth/passkey";
import { prisma } from "@nirman/db";

// ── WebAuthn Relying Party config ────────────────────────────────────
// Derives rpID / rpName / origin from the app URL so passkeys work in
// dev (localhost) and prod (render.com) without code changes. The rpID
// must be a registrable domain suffix of the origin — e.g. for
// https://nirman.onrender.com, rpID can be "nirman.onrender.com".
// NEXT_PUBLIC_APP_URL is already set in render.yaml + .env.
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const appOrigin = appUrl.replace(/\/$/, ""); // no trailing slash
let rpId: string;
try {
  rpId = new URL(appOrigin).hostname;
} catch {
  rpId = "localhost";
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Static baseURL — simplest and most reliable for single-domain deploys.
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  // No dev fallback — env-validation.ts crashes the process in production if
  // BETTER_AUTH_SECRET is missing. In dev, generate a stable per-install secret
  // so sessions persist across restarts (derived from the app URL).
  secret: process.env.BETTER_AUTH_SECRET ?? (process.env.NODE_ENV === "production"
    ? undefined // env-validation.ts will crash before this is reached
    : `dev-secret-${appOrigin}-32chars-padding!!`),
  // Disable rate limiting — Render's proxy doesn't forward client IP headers,
  // so Better-Auth falls back to a single shared rate-limit bucket for ALL
  // users. This causes 429s after just a few requests. With a single-client
  // app, rate limiting is unnecessary.
  rateLimit: {
    enabled: false,
  },
  emailAndPassword: {
    enabled: true,
    // Disable Better-Auth's built-in public /sign-up/email endpoint. This
    // app is invite-only: the first owner is created via /api/auth/bootstrap
    // (gated to an empty DB), and all subsequent users are created by an
    // admin via direct prisma.user.create. Without this, anyone could POST
    // {email, password, name} and create a dangling user that getCompany()
    // would silently promote into a new isolated tenant. The databaseHook
    // below (user.create.before → false) is a second layer of defense in
    // case this flag is ever accidentally removed.
    disableSignUp: true,
    minPasswordLength: 8,
    // Password resets are admin-managed, not self-service. Employees contact
    // their administrator, who resets the password from Team settings via
    // POST /api/users/[id]/reset-password (direct Prisma, not Better-Auth).
    // Better-Auth's self-service reset endpoints (requestPasswordReset /
    // resetPassword) are effectively dead — no UI calls them and no
    // sendResetPassword callback is configured. The admin flow sets
    // mustChangePassword=true so the employee chooses their own password
    // on next login.
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
  // ── Disable public self-sign-up ────────────────────────────────────
  // This app is invite-only. The first owner is created via
  // /api/auth/bootstrap (gated to an empty DB), and all subsequent users are
  // created by an admin from the Team settings page using direct
  // prisma.user.create — which bypasses Better-Auth's adapter and therefore
  // these hooks. Better-Auth's built-in /sign-up/email endpoint, however, is
  // live whenever emailAndPassword is enabled. Without this hook anyone could
  // POST {email, password, name} and create a dangling user (role defaults to
  // PROJECT_MANAGER, no companyId, no UserCompany membership) which
  // getCompany() would then silently promote into a brand-new isolated
  // "My Company" tenant — i.e. open registration into a fresh tenant.
  // Returning false from user.create.before cancels the write. This hook only
  // fires on Better-Auth adapter writes, so bootstrap / admin / demo-login
  // flows (which use prisma directly) are completely unaffected.
  databaseHooks: {
    user: {
      create: {
        before: async () => false,
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
  // ── Passkey / WebAuthn ─────────────────────────────────────────────
  // Enables biometric login (Face ID / Touch ID / Windows Hello / Android
  // fingerprint) via the device's built-in authenticator. The browser
  // handles the biometric prompt — we never see biometric data. Passkeys
  // are phishing-resistant public-key credentials; the private key never
  // leaves the device. Users still keep password login as a fallback.
  plugins: [
    passkey({
      rpID: rpId,
      rpName: "Nirman Inventory OS",
      origin: appOrigin,
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
