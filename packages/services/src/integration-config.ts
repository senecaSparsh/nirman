import { prisma } from "@nirman/db";
import type { Prisma } from "@nirman/db";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Integration Configuration Service.
 *
 * Stores per-company credentials and settings for external integrations
 * (Tally, WhatsApp, Email SMTP, 99acres, MagicBricks, Housing.com).
 *
 * Secret fields (passwords, API keys, tokens) are encrypted at rest using
 * AES-256-GCM with a key derived from the INTEGRATION_ENCRYPTION_KEY env var.
 * Non-secret fields (base URLs, port numbers, enabled flags) are stored as
 * plain JSON.
 *
 * Only OWNER/ADMIN roles should be allowed to view/edit these settings
 * (enforced at the API layer via requirePermission).
 */

// ── Encryption ──────────────────────────────────────────────

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard IV length
const SALT = "nirman-inventory-integration-v1"; // stable salt for key derivation

function getEncryptionKey(): Buffer {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.DATABASE_URL ?? "nirman-default-dev-key-please-change";
  return scryptSync(secret, SALT, 32);
}

/**
 * Encrypt a secret string. Returns a base64 string prefixed with "enc:" so
 * we can distinguish encrypted from plaintext values.
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: enc:<iv>:<authTag>:<ciphertext> (all base64)
  return `enc:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypt a secret string. Accepts both "enc:"-prefixed (encrypted) and
 * plaintext values (for backward compatibility / migration).
 */
export function decryptSecret(value: string): string {
  if (!value.startsWith("enc:")) return value; // plaintext — return as-is
  const parts = value.split(":");
  if (parts.length !== 4) throw new ServiceError("Invalid encrypted value format", 500);
  const ivB64 = parts[1]!;
  const authTagB64 = parts[2]!;
  const dataB64 = parts[3]!;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

// ── Config Schema Definitions ───────────────────────────────

/**
 * Each integration has a schema defining which fields are secrets vs plain.
 * This drives the UI (password inputs for secrets) and the encryption logic.
 */
export interface IntegrationFieldSchema {
  name: string;
  label: string;
  type: "text" | "password" | "url" | "number" | "boolean";
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string | number | boolean;
}

export interface IntegrationSchema {
  key: string;
  label: string;
  description: string;
  icon: string; // lucide icon name
  fields: IntegrationFieldSchema[];
}

export const INTEGRATION_SCHEMAS: IntegrationSchema[] = [
  {
    key: "TALLY",
    label: "Tally ERP",
    description: "Sync journal entries (sales, purchases, payments) to Tally Prime via HTTP-XML API.",
    icon: "Calculator",
    fields: [
      {
        name: "baseUrl",
        label: "Tally HTTP URL",
        type: "url",
        required: true,
        placeholder: "http://localhost:9000",
        defaultValue: "http://localhost:9000",
        helpText: "Tally Prime's HTTP-XML API endpoint. Default is http://localhost:9000 on the machine running Tally.",
      },
      {
        name: "companyName",
        label: "Tally Company Name",
        type: "text",
        required: true,
        placeholder: "Testify Overseas",
        helpText: "The exact company name as it appears in Tally. Used in the SVCURRENTCOMPANY XML field.",
      },
      {
        name: "timeoutMs",
        label: "Request Timeout (ms)",
        type: "number",
        defaultValue: 10000,
        helpText: "How long to wait for Tally to respond before timing out.",
      },
      {
        name: "autoSync",
        label: "Auto-sync after GL posting",
        type: "boolean",
        defaultValue: false,
        helpText: "When enabled, every journal entry is automatically pushed to Tally immediately after posting. Otherwise, use the manual Sync button on the GL page.",
      },
    ],
  },
  {
    key: "WHATSAPP",
    label: "WhatsApp Business",
    description: "Send automated alerts (low stock, approvals, task assignments) via WhatsApp Business Cloud API.",
    icon: "MessageCircle",
    fields: [
      {
        name: "accessToken",
        label: "Access Token",
        type: "password",
        required: true,
        helpText: "Meta WhatsApp Business Cloud API access token. Get this from Meta Business Suite.",
      },
      {
        name: "phoneNumberId",
        label: "Phone Number ID",
        type: "text",
        required: true,
        helpText: "Your WhatsApp Business phone number ID from Meta Business Suite.",
      },
      {
        name: "apiVersion",
        label: "API Version",
        type: "text",
        defaultValue: "v23.0",
        helpText: "Meta Graph API version.",
      },
    ],
  },
  {
    key: "EMAIL_SMTP",
    label: "Email (SMTP)",
    description: "Send email notifications via your own SMTP server (Gmail, SendGrid, Amazon SES, etc.).",
    icon: "Mail",
    fields: [
      {
        name: "host",
        label: "SMTP Host",
        type: "text",
        required: true,
        placeholder: "smtp.gmail.com",
        helpText: "Your SMTP server hostname.",
      },
      {
        name: "port",
        label: "SMTP Port",
        type: "number",
        required: true,
        defaultValue: 587,
        helpText: "Usually 587 for TLS or 465 for SSL.",
      },
      {
        name: "user",
        label: "Username",
        type: "text",
        required: true,
        helpText: "SMTP authentication username (usually your email address).",
      },
      {
        name: "password",
        label: "Password",
        type: "password",
        required: true,
        helpText: "SMTP password or app-specific password (for Gmail, use an App Password).",
      },
      {
        name: "fromEmail",
        label: "From Email",
        type: "text",
        required: true,
        helpText: "The sender email address for outgoing notifications.",
      },
      {
        name: "fromName",
        label: "From Name",
        type: "text",
        defaultValue: "Nirman Inventory",
        helpText: "Display name for the sender.",
      },
    ],
  },
  {
    key: "PORTAL_99ACRES",
    label: "99acres",
    description: "Auto-list and delist built units on 99acres property portal.",
    icon: "Building2",
    fields: [
      {
        name: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        helpText: "99acres partner API key. Contact 99acres for API access.",
      },
      {
        name: "baseUrl",
        label: "API Base URL",
        type: "url",
        defaultValue: "https://api.99acres.com/v1",
        helpText: "99acres API endpoint.",
      },
    ],
  },
  {
    key: "PORTAL_MAGICBRICKS",
    label: "MagicBricks",
    description: "Auto-list and delist built units on MagicBricks property portal.",
    icon: "Building2",
    fields: [
      {
        name: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        helpText: "MagicBricks partner API key.",
      },
      {
        name: "baseUrl",
        label: "API Base URL",
        type: "url",
        defaultValue: "https://api.magicbricks.com/v1",
        helpText: "MagicBricks API endpoint.",
      },
    ],
  },
  {
    key: "PORTAL_HOUSING",
    label: "Housing.com",
    description: "Auto-list and delist built units on Housing.com property portal.",
    icon: "Building2",
    fields: [
      {
        name: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        helpText: "Housing.com partner API key.",
      },
      {
        name: "baseUrl",
        label: "API Base URL",
        type: "url",
        defaultValue: "https://api.housing.com/v1",
        helpText: "Housing.com API endpoint.",
      },
    ],
  },
];

// Fields that should be encrypted at rest
const SECRET_FIELDS = new Set(["accessToken", "password", "apiKey"]);

// ── CRUD Operations ─────────────────────────────────────────

export interface GetIntegrationConfigInput {
  companyId: string;
  key: string;
}

/**
 * Get an integration config (with secrets decrypted) for internal use.
 */
export async function getIntegrationConfig({ companyId, key }: GetIntegrationConfigInput) {
  const config = await prisma.integrationConfig.findUnique({
    where: { companyId_key: { companyId, key } },
  });
  if (!config) return null;
  return decryptConfig(config);
}

/**
 * Get all integration configs for a company (with secrets decrypted).
 */
export async function listIntegrationConfigs(companyId: string) {
  const configs = await prisma.integrationConfig.findMany({
    where: { companyId },
    orderBy: { key: "asc" },
  });
  return configs.map(decryptConfig);
}

/**
 * Get integration configs with secrets masked (for UI display).
 * Secrets are replaced with "••••••••" so they're never sent to the browser.
 */
export async function listIntegrationConfigsMasked(companyId: string) {
  const configs = await listIntegrationConfigs(companyId);
  return configs.map((c) => ({
    ...c,
    config: maskSecrets(c.config, c.key),
  }));
}

/**
 * Upsert an integration config. Secret fields are encrypted before storage.
 */
export async function upsertIntegrationConfig(input: {
  companyId: string;
  key: string;
  enabled: boolean;
  config: Record<string, unknown>;
  userId?: string;
}) {
  const schema = INTEGRATION_SCHEMAS.find((s) => s.key === input.key);
  if (!schema) throw new ServiceError(`Unknown integration: ${input.key}`, 400);

  const encryptedConfig = encryptConfigFields(input.config, input.key) as Prisma.InputJsonValue;

  const result = await prisma.integrationConfig.upsert({
    where: { companyId_key: { companyId: input.companyId, key: input.key } },
    create: {
      companyId: input.companyId,
      key: input.key,
      enabled: input.enabled,
      config: encryptedConfig,
    },
    update: {
      enabled: input.enabled,
      config: encryptedConfig,
      lastVerifyError: null, // clear previous error on config change
    },
  });

  if (input.userId) {
    await logAction(prisma, {
      companyId: input.companyId,
      userId: input.userId,
      action: "INTEGRATION_CONFIG_UPDATE",
      entityType: "IntegrationConfig",
      entityId: result.id,
      after: { key: input.key, enabled: input.enabled },
    });
  }

  return result;
}

/**
 * Delete an integration config (disable and remove credentials).
 */
export async function deleteIntegrationConfig(input: {
  companyId: string;
  key: string;
  userId?: string;
}) {
  const result = await prisma.integrationConfig.deleteMany({
    where: { companyId: input.companyId, key: input.key },
  });

  if (input.userId && result.count > 0) {
    await logAction(prisma, {
      companyId: input.companyId,
      userId: input.userId,
      action: "INTEGRATION_CONFIG_DELETE",
      entityType: "IntegrationConfig",
      entityId: input.key,
      after: { key: input.key },
    });
  }

  return { deleted: result.count };
}

// ── Test / Verify ───────────────────────────────────────────

/**
 * Test an integration connection. Returns success or an error message.
 * Updates lastVerifiedAt and lastVerifyError on the config record.
 */
export async function verifyIntegration(input: {
  companyId: string;
  key: string;
  userId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { companyId, key } = input;
  const config = await getIntegrationConfig({ companyId, key });
  if (!config) return { success: false, error: "Integration not configured" };
  if (!config.enabled) return { success: false, error: "Integration is disabled" };

  let success = false;
  let error: string | undefined;

  try {
    switch (key) {
      case "TALLY": {
        const { HttpTallyProvider } = await import("./tally");
        const baseUrl = (config.config.baseUrl as string) || "http://localhost:9000";
        const provider = new HttpTallyProvider(baseUrl, 5000);
        // Send a minimal export request to check connectivity
        const testXml = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST><VERSION>1</VERSION></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY></SVCURRENTCOMPANY></STATICVARIABLES></BODY></ENVELOPE>`;
        await provider.fetchCollection(testXml);
        success = true;
        break;
      }
      case "WHATSAPP": {
        const accessToken = config.config.accessToken as string;
        const phoneNumberId = config.config.phoneNumberId as string;
        const apiVersion = (config.config.apiVersion as string) || "v23.0";
        if (!accessToken || !phoneNumberId) {
          error = "Missing access token or phone number ID";
          break;
        }
        // Verify by fetching the WhatsApp Business profile
        const res = await fetch(
          `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/whatsapp_business_profile?fields=name`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (res.ok) {
          success = true;
        } else {
          const data = await res.json().catch(() => ({}));
          error = (data?.error?.message as string) || `WhatsApp API returned ${res.status}`;
        }
        break;
      }
      case "EMAIL_SMTP": {
        // Verify SMTP by attempting a no-op connection
        const host = config.config.host as string;
        const port = Number(config.config.port);
        const user = config.config.user as string;
        const password = config.config.password as string;
        if (!host || !port || !user || !password) {
          error = "Missing SMTP host, port, username, or password";
          break;
        }
        // Dynamic import of nodemailer (optional dependency)
        try {
          const nodemailer = await import("nodemailer");
          const transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass: password },
          });
          await transporter.verify();
          success = true;
        } catch (importErr) {
          error = "SMTP verification requires nodemailer. Install it with: pnpm --filter @nirman/services add nodemailer";
        }
        break;
      }
      case "PORTAL_99ACRES":
      case "PORTAL_MAGICBRICKS":
      case "PORTAL_HOUSING": {
        const apiKey = config.config.apiKey as string;
        const baseUrl = config.config.baseUrl as string;
        if (!apiKey || !baseUrl) {
          error = "Missing API key or base URL";
          break;
        }
        // Simple connectivity check — HEAD request to the base URL
        const res = await fetch(baseUrl, {
          method: "HEAD",
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(5000),
        }).catch((e) => ({ ok: false, status: 0, statusText: e instanceof Error ? e.message : "Network error" }));
        if (res.ok) {
          success = true;
        } else {
          error = `Portal API returned ${res.status} ${res.statusText}`;
        }
        break;
      }
      default:
        error = `Unknown integration: ${key}`;
    }
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : "Verification failed";
  }

  // Update the config record with verification result
  await prisma.integrationConfig.update({
    where: { companyId_key: { companyId, key } },
    data: {
      lastVerifiedAt: new Date(),
      lastVerifyError: success ? null : error,
    },
  });

  if (input.userId) {
    await logAction(prisma, {
      companyId,
      userId: input.userId,
      action: "INTEGRATION_VERIFY",
      entityType: "IntegrationConfig",
      entityId: key,
      after: { success, error },
    });
  }

  return { success, error };
}

// ── Provider Factory (uses DB config instead of env vars) ───

/**
 * Create a Tally provider from the DB-stored config for a company.
 * Falls back to env var / stub if no config exists.
 */
export async function createTallyProviderFromConfig(companyId: string) {
  const config = await getIntegrationConfig({ companyId, key: "TALLY" });
  if (config?.enabled) {
    const { HttpTallyProvider } = await import("./tally");
    const baseUrl = (config.config.baseUrl as string) || "http://localhost:9000";
    const timeoutMs = Number(config.config.timeoutMs) || 10000;
    return new HttpTallyProvider(baseUrl, timeoutMs);
  }
  // Fall back to env-based factory
  const { createTallyProvider } = await import("./tally");
  return createTallyProvider();
}

/**
 * Create a WhatsApp provider from the DB-stored config for a company.
 */
export async function createWhatsAppProviderFromConfig(companyId: string) {
  const config = await getIntegrationConfig({ companyId, key: "WHATSAPP" });
  if (config?.enabled) {
    const { CloudWhatsAppProvider } = await import("./notifications");
    return new CloudWhatsAppProvider({
      accessToken: config.config.accessToken as string,
      phoneNumberId: config.config.phoneNumberId as string,
      apiVersion: (config.config.apiVersion as string) || "v23.0",
    });
  }
  const { createWhatsAppProvider } = await import("./notifications");
  return createWhatsAppProvider();
}

/**
 * Create an Email provider from the DB-stored config for a company.
 * Uses SMTP via nodemailer if configured.
 */
export async function createEmailProviderFromConfig(companyId: string) {
  const config = await getIntegrationConfig({ companyId, key: "EMAIL_SMTP" });
  if (config?.enabled) {
    return new SmtpEmailProvider({
      host: config.config.host as string,
      port: Number(config.config.port),
      user: config.config.user as string,
      password: config.config.password as string,
      fromEmail: config.config.fromEmail as string,
      fromName: (config.config.fromName as string) || "Nirman Inventory",
    });
  }
  // Fall back to stub
  const { StubEmailProvider } = await import("./notifications");
  return new StubEmailProvider();
}

/**
 * Create a portal provider from the DB-stored config for a company.
 */
export async function createPortalProviderFromConfig(companyId: string, portalName: string) {
  const keyMap: Record<string, string> = {
    "99acres": "PORTAL_99ACRES",
    "MagicBricks": "PORTAL_MAGICBRICKS",
    "Housing.com": "PORTAL_HOUSING",
  };
  const configKey = keyMap[portalName];
  if (!configKey) throw new ServiceError(`Unknown portal: ${portalName}`, 400);

  const config = await getIntegrationConfig({ companyId, key: configKey });
  if (config?.enabled) {
    const { NineAcresProvider, MagicBricksProvider, HousingProvider } = await import("./portal-listing");
    const apiKey = config.config.apiKey as string;
    const baseUrl = config.config.baseUrl as string;
    switch (portalName) {
      case "99acres": return new NineAcresProvider(apiKey, baseUrl);
      case "MagicBricks": return new MagicBricksProvider(apiKey, baseUrl);
      case "Housing.com": return new HousingProvider(apiKey, baseUrl);
    }
  }
  // Fall back to manual provider (generates pre-filled URLs, not fake stubs)
  const { ManualPortalProvider } = await import("./portal-listing");
  return new ManualPortalProvider(portalName);
}

// ── SMTP Email Provider ─────────────────────────────────────

/**
 * Real SMTP email provider using nodemailer.
 * Sends emails via a configurable SMTP server.
 */
export class SmtpEmailProvider {
  private host: string;
  private port: number;
  private user: string;
  private password: string;
  private fromEmail: string;
  private fromName: string;

  constructor(opts: {
    host: string;
    port: number;
    user: string;
    password: string;
    fromEmail: string;
    fromName: string;
  }) {
    this.host = opts.host;
    this.port = opts.port;
    this.user = opts.user;
    this.password = opts.password;
    this.fromEmail = opts.fromEmail;
    this.fromName = opts.fromName;
  }

  async sendEmail(to: string, subject: string, body: string): Promise<{ success: boolean; error?: string }> {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.port === 465,
        auth: { user: this.user, pass: this.password },
      });

      await transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to,
        subject,
        html: body,
      });

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to send email" };
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────

function encryptConfigFields(
  config: Record<string, unknown>,
  integrationKey: string,
): Record<string, unknown> {
  const schema = INTEGRATION_SCHEMAS.find((s) => s.key === integrationKey);
  if (!schema) return config;

  const result: Record<string, unknown> = {};
  for (const field of schema.fields) {
    const value = config[field.name];
    if (value === undefined || value === null || value === "") {
      if (field.defaultValue !== undefined) {
        result[field.name] = field.defaultValue;
      }
      continue;
    }
    if (field.type === "password" || SECRET_FIELDS.has(field.name)) {
      // Don't re-encrypt if already encrypted (e.g., masked value coming back as "••••")
      const strVal = String(value);
      if (strVal.startsWith("enc:") || strVal === "••••••••") {
        // Keep existing — but if it's masked, we need to preserve the old value
        // This is handled by the API layer (frontend sends masked = unchanged)
        result[field.name] = strVal;
      } else {
        result[field.name] = encryptSecret(strVal);
      }
    } else {
      result[field.name] = field.type === "number" ? Number(value) : value;
    }
  }
  return result;
}

function decryptConfig(config: {
  id: string;
  companyId: string;
  key: string;
  enabled: boolean;
  config: unknown;
  lastVerifiedAt: Date | null;
  lastVerifyError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const rawConfig = config.config as Record<string, unknown>;
  const decrypted: Record<string, unknown> = {};

  const schema = INTEGRATION_SCHEMAS.find((s) => s.key === config.key);
  if (schema) {
    for (const field of schema.fields) {
      const value = rawConfig[field.name];
      if (value === undefined || value === null) continue;
      if (field.type === "password" || SECRET_FIELDS.has(field.name)) {
        const strVal = String(value);
        decrypted[field.name] = strVal.startsWith("enc:") ? decryptSecret(strVal) : strVal;
      } else {
        decrypted[field.name] = value;
      }
    }
  } else {
    // Unknown integration — return as-is
    Object.assign(decrypted, rawConfig);
  }

  return {
    id: config.id,
    companyId: config.companyId,
    key: config.key,
    enabled: config.enabled,
    config: decrypted,
    lastVerifiedAt: config.lastVerifiedAt,
    lastVerifyError: config.lastVerifyError,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

function maskSecrets(config: Record<string, unknown>, integrationKey: string): Record<string, unknown> {
  const schema = INTEGRATION_SCHEMAS.find((s) => s.key === integrationKey);
  if (!schema) return config;

  const masked: Record<string, unknown> = {};
  for (const field of schema.fields) {
    const value = config[field.name];
    if (value === undefined || value === null || value === "") continue;
    if (field.type === "password" || SECRET_FIELDS.has(field.name)) {
      masked[field.name] = "••••••••";
    } else {
      masked[field.name] = value;
    }
  }
  return masked;
}

/**
 * Get the integration status summary for a company.
 * Returns which integrations are configured, enabled, and verified.
 */
export async function getIntegrationStatus(companyId: string) {
  const configs = await prisma.integrationConfig.findMany({
    where: { companyId },
  });

  return INTEGRATION_SCHEMAS.map((schema) => {
    const config = configs.find((c) => c.key === schema.key);
    return {
      key: schema.key,
      label: schema.label,
      description: schema.description,
      icon: schema.icon,
      configured: !!config,
      enabled: config?.enabled ?? false,
      lastVerifiedAt: config?.lastVerifiedAt ?? null,
      lastVerifyError: config?.lastVerifyError ?? null,
    };
  });
}
