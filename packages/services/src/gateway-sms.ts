/**
 * Self-hosted SMS gateway — sends SMS through the free "SMS Gateway for
 * Android" app (github.com/capcom6/android-sms-gateway, MIT) installed on an
 * office phone, or the matching self-hosted server (same API contract). No
 * per-message cost, no third-party provider in the middle.
 *
 * The app exposes:
 *   POST {base}/message   — send an SMS (basic auth, JSON body)
 *   GET  {base}/webhooks  — list registered webhooks (used as the health
 *                           check: proves reachability + credentials without
 *                           sending a real SMS)
 * and calls POST {your-url} for every received SMS — wire that to
 * /api/sms/intake (inbound already exists server-side).
 *
 * Config resolution order:
 *   1. Per-company IntegrationConfig (key SMS_GATEWAY) — encrypted at rest.
 *   2. Global env vars SMS_GATEWAY_URL / SMS_GATEWAY_USER / SMS_GATEWAY_PASSWORD
 *      — the fallback for pre-login sends (OTP) where the company is unknown.
 */

import { prisma } from "@nirman/db";
import { getIntegrationConfig } from "./integration-config";

export interface SmsGatewayConfig {
  /** Base URL — e.g. http://192.168.1.50:8080 or https://sms.example.com/3rdparty/v1 */
  url: string;
  username: string;
  password: string;
  /** Optional SIM slot for dual-SIM phones (1-based). */
  simNumber?: number;
}

export interface SmsSendResult {
  sent: boolean;
  error?: string;
}

/** Normalise an Indian phone to E.164. */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

/**
 * Accept whatever the user pasted — base URL or a full endpoint URL — and
 * return the base: strips trailing slashes and trailing /message or
 * /webhooks path segments.
 */
export function normalizeGatewayBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  url = url.replace(/\/(message|webhooks)$/i, "");
  return url;
}

function basicAuth(cfg: SmsGatewayConfig): string {
  return `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64")}`;
}

/**
 * Send one SMS through the gateway. `{ sent: true }` means the gateway
 * accepted the message (the phone then delivers it on the SIM).
 */
export async function sendSmsViaGateway(
  cfg: SmsGatewayConfig,
  phone: string,
  message: string,
): Promise<SmsSendResult> {
  const base = normalizeGatewayBaseUrl(cfg.url);
  if (!base) return { sent: false, error: "SMS gateway URL is empty" };
  try {
    const res = await fetch(`${base}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth(cfg) },
      body: JSON.stringify({
        message,
        phoneNumbers: [toE164(phone)],
        ...(cfg.simNumber ? { simNumber: cfg.simNumber } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { sent: false, error: "SMS gateway rejected the username/password" };
      }
      return { sent: false, error: `SMS gateway returned ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "SMS gateway unreachable" };
  }
}

/**
 * Connectivity + credential check without sending a real SMS — GET
 * {base}/webhooks returns the registered webhook list under the same auth.
 */
export async function testSmsGateway(cfg: SmsGatewayConfig): Promise<SmsSendResult> {
  const base = normalizeGatewayBaseUrl(cfg.url);
  if (!base) return { sent: false, error: "SMS gateway URL is empty" };
  try {
    const res = await fetch(`${base}/webhooks`, {
      headers: { Authorization: basicAuth(cfg) },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { sent: true };
    if (res.status === 401 || res.status === 403) {
      return { sent: false, error: "Wrong username or password" };
    }
    return { sent: false, error: `Gateway returned ${res.status}` };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Gateway unreachable — is the phone on the network?" };
  }
}

/** Config from env vars — the global fallback used for pre-login OTP sends. */
export function smsGatewayConfigFromEnv(): SmsGatewayConfig | null {
  const url = process.env.SMS_GATEWAY_URL;
  const username = process.env.SMS_GATEWAY_USER;
  const password = process.env.SMS_GATEWAY_PASSWORD;
  if (!url || !username || !password) return null;
  const sim = process.env.SMS_GATEWAY_SIM;
  return {
    url,
    username,
    password,
    ...(sim && Number(sim) > 0 ? { simNumber: Number(sim) } : {}),
  };
}

/** True when an env-var gateway is configured (sync check for pre-login paths). */
export function isSmsGatewayConfiguredFromEnv(): boolean {
  return Boolean(process.env.SMS_GATEWAY_URL && process.env.SMS_GATEWAY_USER && process.env.SMS_GATEWAY_PASSWORD);
}

/** Per-company config → env fallback. */
export async function resolveSmsGatewayConfig(companyId?: string): Promise<SmsGatewayConfig | null> {
  if (companyId) {
    const cfg = await getIntegrationConfig({ companyId, key: "SMS_GATEWAY" });
    if (cfg?.enabled) {
      const url = cfg.config.gatewayUrl as string;
      const username = cfg.config.username as string;
      const password = cfg.config.password as string;
      if (url && username && password) {
        const sim = Number(cfg.config.simNumber);
        return { url, username, password, ...(sim > 0 ? { simNumber: sim } : {}) };
      }
    }
  }
  return smsGatewayConfigFromEnv();
}

/**
 * Resolve config for the company (or env) and send. Used by any caller that
 * needs plain SMS send — OTP flows pass companyId when they know it.
 */
export async function sendGatewaySms(
  companyId: string | undefined,
  phone: string,
  message: string,
): Promise<SmsSendResult> {
  const cfg = await resolveSmsGatewayConfig(companyId);
  if (cfg) return sendSmsViaGateway(cfg, phone, message);
  // No URL gateway — but a company phone with the Nirman app polls the
  // outbox and sends on its own SIM. Queue it: zero config anywhere.
  if (companyId && (await hasSmsDevice(companyId))) {
    return enqueueSms(companyId, phone, message);
  }
  return { sent: false, error: "SMS gateway not configured" };
}

/** Any registered (non-revoked) company phone that can send SMS. */
export async function hasSmsDevice(companyId: string): Promise<boolean> {
  const count = await prisma.smsIngestToken.count({
    where: { companyId, revokedAt: null },
  });
  return count > 0;
}

/**
 * Queue an SMS for the company's device fleet. The next app poll on
 * GET /api/sms/outbox delivers it to the phone, which sends it on its
 * own SIM and acks — { sent: true } here means accepted-for-delivery.
 */
export async function enqueueSms(
  companyId: string,
  phone: string,
  message: string,
): Promise<SmsSendResult> {
  await prisma.smsOutbox.create({
    data: { companyId, toPhone: toE164(phone), body: message },
  });
  return { sent: true };
}
