/**
 * Environment Variable Validation
 * =================================
 *
 * Validates that all required environment variables are set before the app
 * starts. Fails fast with a clear, actionable error message instead of
 * cryptic runtime errors (e.g. "Cannot read properties of undefined" when
 * DATABASE_URL is missing and Prisma tries to connect).
 *
 * Called from instrumentation.ts (runs once before the server starts).
 * In production, a missing required var crashes the process immediately —
 * the start wrapper then restarts, but the error is logged clearly so
 * the operator knows to set the missing var in the Render dashboard.
 *
 * In development, missing vars log a warning but don't crash (dev often
 * runs with partial config, e.g. without Twilio).
 */

type EnvVarSpec = {
  key: string;
  required: boolean;
  description: string;
  /** If true, only required in production. */
  prodOnly?: boolean;
};

const ENV_VARS: EnvVarSpec[] = [
  {
    key: "DATABASE_URL",
    required: true,
    description: "PostgreSQL connection string (from Render or docker-compose)",
  },
  {
    key: "BETTER_AUTH_SECRET",
    required: true,
    description: "Secret key for signing auth sessions (long random string)",
  },
  {
    key: "NEXT_PUBLIC_APP_URL",
    required: true,
    description: "Public URL of the app (e.g. https://nirman-inventory.onrender.com)",
  },
  {
    key: "BETTER_AUTH_URL",
    required: true,
    description: "URL where Better-Auth is served (same as NEXT_PUBLIC_APP_URL)",
  },
  {
    key: "DIRECT_URL",
    required: false,
    description: "Non-pooled DB URL for Prisma migrations (optional in dev)",
  },
  {
    key: "TWILIO_ACCOUNT_SID",
    required: false,
    description: "Twilio account SID for SMS/calls (optional — telephony features disabled without it)",
  },
  {
    key: "TWILIO_AUTH_TOKEN",
    required: false,
    description: "Twilio auth token (optional — telephony features disabled without it)",
  },
  {
    key: "VAPID_PUBLIC_KEY",
    required: false,
    description: "VAPID public key for web push notifications (optional — push disabled without it)",
  },
  {
    key: "VAPID_PRIVATE_KEY",
    required: false,
    description: "VAPID private key for web push notifications (optional — push disabled without it)",
  },
  {
    key: "VAPID_SUBJECT",
    required: false,
    description: "VAPID subject (mailto: or HTTPS URL) for push notification claims",
  },
  {
    key: "AUTH_BYPASS",
    required: false,
    description: "Set to 'true' for headless dev (skips sign-in). NEVER set in production.",
  },
  {
    key: "CRON_SECRET",
    required: false,
    description: "Secret key for cron job endpoints (/api/cron/*). Required for automated backups.",
  },
  {
    key: "INTEGRATION_ENCRYPTION_KEY",
    required: false,
    description: "AES-256 key for encrypting integration secrets at rest. Required if integrations are used.",
  },
  {
    key: "UPLOAD_DIR",
    required: false,
    description: "Directory for file uploads (defaults to storage/uploads). Set to match volume mount in production.",
  },
  {
    key: "SENTRY_DSN",
    required: false,
    description: "Sentry DSN for error tracking (optional — Sentry disabled without it).",
  },
  {
    key: "GSTA_API_KEY",
    required: false,
    description: "gstaccelerator.in API key for HSN/GST auto-sync. If set, unknown HSN codes are auto-fetched from the API and cached. Get a free key at gstaccelerator.in/dashboard.",
  },
];

export interface EnvValidationResult {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Determine if an env var spec is required given the current environment.
 * Pure function — no process.env access.
 *
 * A var is required if spec.required is true AND (it's not prodOnly OR we're in prod).
 */
export function isEnvVarRequired(
  spec: { required: boolean; prodOnly?: boolean },
  isProd: boolean,
): boolean {
  return spec.required && !(spec.prodOnly && !isProd);
}

/**
 * Check if AUTH_BYPASS=true is dangerously set in production.
 * Pure function — takes the env values as parameters.
 */
export function isAuthBypassDangerous(
  authBypassValue: string | undefined,
  isProd: boolean,
): boolean {
  return isProd && authBypassValue === "true";
}

export function validateEnv(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  const isProd = process.env.NODE_ENV === "production";

  // Safety check: AUTH_BYPASS=true must NEVER be set in production.
  // This is a fatal error — it bypasses authentication entirely, exposing
  // the whole app to unauthenticated access. We fail before the server
  // starts rather than relying on every call site to check NODE_ENV.
  if (isAuthBypassDangerous(process.env.AUTH_BYPASS, isProd)) {
    const msg =
      "AUTH_BYPASS=true is set in production! This bypasses authentication entirely. " +
      "Remove it from the Render dashboard immediately.";
    console.error(
      [
        "",
        "═══════════════════════════════════════════════════════════════",
        "  FATAL: AUTH_BYPASS IS SET IN PRODUCTION",
        "═══════════════════════════════════════════════════════════════",
        `  ${msg}`,
        "  The server will exit to prevent unauthenticated access.",
        "═══════════════════════════════════════════════════════════════",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  for (const spec of ENV_VARS) {
    const value = process.env[spec.key];
    const isRequired = spec.required && !(spec.prodOnly && !isProd);

    if (isRequired && !value) {
      missing.push(`${spec.key} — ${spec.description}`);
    } else if (!value && spec.required === false) {
      // Optional var not set — note it but don't fail.
      // Only warn for non-optional-in-prod vars that are missing in dev.
    }

    // Warn about important optional vars missing in production
    if (isProd && !value && spec.key === "CRON_SECRET") {
      warnings.push("CRON_SECRET is not set — automated backups and cron reminders will not work.");
    }
    if (isProd && !value && spec.key === "INTEGRATION_ENCRYPTION_KEY") {
      warnings.push("INTEGRATION_ENCRYPTION_KEY is not set — integration secrets cannot be encrypted. Setting any integration will fail.");
    }
    if (isProd && !value && spec.key === "SENTRY_DSN") {
      warnings.push("SENTRY_DSN is not set — production errors will not be tracked.");
    }
  }

  if (missing.length > 0) {
    const isProd = process.env.NODE_ENV === "production";
    const message = [
      "",
      "═══════════════════════════════════════════════════════════════",
      "  ENVIRONMENT VARIABLE VALIDATION FAILED",
      "═══════════════════════════════════════════════════════════════",
      "",
      `  The following ${missing.length} required env var(s) are missing:`,
      "",
      ...missing.map((m) => `  ✗ ${m}`),
      "",
      "  Set them in your .env file (dev) or Render dashboard (prod).",
      "",
      isProd
        ? "  The server will exit. The start wrapper will retry, but it will"
        : "  The server will continue in dev mode, but some features may fail.",
      isProd ? "  keep failing until the vars are set." : "",
      "═══════════════════════════════════════════════════════════════",
      "",
    ]
      .filter(Boolean)
      .join("\n");

    if (isProd) {
      console.error(message);
      process.exit(1);
    } else {
      console.warn(message);
    }
  }

  if (warnings.length > 0) {
    for (const w of warnings) {
      console.warn(`⚠️  ENV WARNING: ${w}`);
    }
  }

  return { ok: missing.length === 0, missing, warnings };
}
