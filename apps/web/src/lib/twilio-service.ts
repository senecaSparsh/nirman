import TwilioSDK from "twilio";

type TwilioClient = TwilioSDK.Twilio;

/**
 * Twilio service layer — all Twilio API interactions go through here.
 *
 * DESIGN DECISIONS:
 *
 * 1. **Read-only by default.** The methods here only READ from Twilio
 *    (fetch numbers, fetch calls, fetch recordings) and configure
 *    webhooks (free). No outbound calls, no SMS, no buying numbers —
 *    those consume credits and are explicitly out of scope.
 *
 * 2. **Multi-number, multi-user.** A company can have many Twilio
 *    numbers. Each number is a `CompanyPhone` with `provider: "TWILIO"`
 *    and `providerNumberId` = the Twilio SID. Numbers are assigned to
 *    staff via the existing `assignedToUserId` field. The webhook
 *    receiver uses the `To` field to identify which company number
 *    was called, and the `From` field (if it matches a staff member's
 *    phone) to identify the caller.
 *
 * 3. **Owner-only config.** Only the OWNER can connect/disconnect the
 *    Twilio account, sync numbers, and configure webhooks. This is
 *    enforced at the API route level via `requirePermission(PERM.TELEPHONY_MANAGE)`
 *    AND an explicit role check (OWNER only).
 *
 * 4. **Credentials in env, not DB.** The Twilio Account SID and Auth
 *    Token are stored in environment variables, not in the
 *    `TelephonyProviderConfig` table. This is more secure and allows
 *    a single Twilio account to serve multiple companies (each company
 *    just picks which numbers belong to it). The `TelephonyProviderConfig`
 *    row for TWILIO stores a reference marker (`env:TWILIO_ACCOUNT_SID`)
 *    rather than the actual secret.
 */

let _client: TwilioClient | null = null;

/**
 * Get the Twilio client singleton. Returns null if credentials are
 * not configured (so the UI can show a "not connected" state).
 */
export function getTwilioClient(): TwilioClient | null {
  if (_client) return _client;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) return null;

  _client = new (TwilioSDK as unknown as new (sid: string, token: string) => TwilioClient)(accountSid, authToken);
  return _client;
}

/** Check if Twilio is configured (env vars present). */
export function isTwilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

/** Get the Twilio account SID (for display, not secret). */
export function getTwilioAccountSid(): string | null {
  return process.env.TWILIO_ACCOUNT_SID ?? null;
}

// ── Types ──

export interface TwilioPhoneNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string | null;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  voiceUrl: string | null;
  voiceMethod: string | null;
  statusCallback: string | null;
  statusCallbackMethod: string | null;
  smsUrl: string | null;
  apiVersion: string;
  dateCreated: string;
}

export interface TwilioCallRecord {
  sid: string;
  from: string;
  to: string;
  direction: string;
  status: string;
  duration: string;
  startTime: string | null;
  endTime: string | null;
  fromFormatted: string | null;
  toFormatted: string | null;
  recordingUrl: string | null;
  price: string | null;
  parentCallSid: string | null;
}

export interface TwilioAccountInfo {
  sid: string;
  friendlyName: string;
  status: string;
  type: string;
}

// ── Read-only API methods ──

/**
 * Fetch the Twilio account info (free, read-only).
 */
export async function getAccountInfo(): Promise<TwilioAccountInfo | null> {
  const client = getTwilioClient();
  if (!client) return null;

  const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID!).fetch();
  return {
    sid: account.sid,
    friendlyName: account.friendlyName,
    status: account.status,
    type: account.type ?? "Full",
  };
}

/**
 * Fetch all incoming phone numbers on the Twilio account (free, read-only).
 * These are the numbers the company can assign to staff.
 */
export async function fetchTwilioNumbers(): Promise<TwilioPhoneNumber[]> {
  const client = getTwilioClient();
  if (!client) return [];

  const numbers = await client.incomingPhoneNumbers.list({ limit: 100 });
  return numbers.map((n) => ({
    sid: n.sid,
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName ?? null,
    capabilities: {
      voice: n.capabilities?.voice ?? false,
      sms: n.capabilities?.sms ?? false,
      mms: n.capabilities?.mms ?? false,
    },
    voiceUrl: n.voiceUrl || null,
    voiceMethod: n.voiceMethod || null,
    statusCallback: n.statusCallback || null,
    statusCallbackMethod: n.statusCallbackMethod || null,
    smsUrl: n.smsUrl || null,
    apiVersion: n.apiVersion,
    dateCreated: n.dateCreated?.toISOString() ?? new Date().toISOString(),
  }));
}

/**
 * Fetch recent calls from Twilio (free, read-only).
 * Used for syncing call history into our CallLog table.
 */
export async function fetchRecentCalls(limit = 50): Promise<TwilioCallRecord[]> {
  const client = getTwilioClient();
  if (!client) return [];

  const calls = await client.calls.list({ limit });
  return calls.map((c) => ({
    sid: c.sid,
    from: c.from ?? "",
    to: c.to ?? "",
    direction: c.direction ?? "",
    status: c.status ?? "",
    duration: c.duration ?? "0",
    startTime: c.startTime?.toISOString() ?? null,
    endTime: c.endTime?.toISOString() ?? null,
    fromFormatted: c.fromFormatted ?? null,
    toFormatted: c.toFormatted ?? null,
    recordingUrl: null, // recordings are fetched separately per call
    price: c.price ?? null,
    parentCallSid: c.parentCallSid ?? null,
  }));
}

/**
 * Fetch recordings for a specific call (free, read-only).
 */
export async function fetchCallRecordings(callSid: string): Promise<{
  sid: string;
  uri: string;
  duration: string;
  status: string;
}[]> {
  const client = getTwilioClient();
  if (!client) return [];

  const recordings = await client.recordings.list({ callSid, limit: 10 });
  return recordings.map((r) => ({
    sid: r.sid,
    uri: r.uri,
    duration: r.duration ?? "0",
    status: r.status ?? "",
  }));
}

// ── Webhook configuration (free, no credits consumed) ──

/**
 * Configure the voice URL and status callback for a Twilio number.
 * This tells Twilio where to send webhook events when this number
 * receives or makes a call. This is FREE — it's just updating a URL
 * on the number's config, no calls are made.
 *
 * @param numberSid  The Twilio phone number SID (PNxxx)
 * @param webhookBaseUrl  Our app's base URL (e.g. https://app.nirman.in)
 * @param companyId  The company ID (included in webhook URL for routing)
 */
export async function configureNumberWebhook(
  numberSid: string,
  webhookBaseUrl: string,
  companyId: string,
): Promise<{ voiceUrl: string; statusCallback: string }> {
  const client = getTwilioClient();
  if (!client) throw new Error("Twilio not configured");

  const voiceUrl = `${webhookBaseUrl}/api/telephony/webhook/twilio/voice?companyId=${companyId}`;
  const statusCallback = `${webhookBaseUrl}/api/telephony/webhook/twilio/status?companyId=${companyId}`;

  await client
    .incomingPhoneNumbers(numberSid)
    .update({
      voiceUrl,
      voiceMethod: "POST",
      statusCallback,
      statusCallbackMethod: "POST",
    });

  return { voiceUrl, statusCallback };
}

/**
 * Remove webhook configuration from a Twilio number (when a company
 * stops using it). Also free.
 */
export async function clearNumberWebhook(numberSid: string): Promise<void> {
  const client = getTwilioClient();
  if (!client) throw new Error("Twilio not configured");

  await client
    .incomingPhoneNumbers(numberSid)
    .update({
      voiceUrl: "",
      voiceMethod: "POST",
      statusCallback: "",
      statusCallbackMethod: "POST",
    });
}

// ── Helpers ──

/**
 * Normalize a Twilio phone number (E.164) to our normalized format
 * (digits only, no leading +).
 */
export function normalizeTwilioNumber(number: string): string {
  return number.replace(/^\+/, "").replace(/\D/g, "");
}

/**
 * Check if a phone number belongs to the Twilio account (is a company
 * number, not an external number).
 */
export function isTwilioNumber(
  number: string,
  twilioNumbers: TwilioPhoneNumber[],
): boolean {
  const normalized = normalizeTwilioNumber(number);
  return twilioNumbers.some((n) => normalizeTwilioNumber(n.phoneNumber) === normalized);
}

/**
 * Map Twilio call status to our CallLog status.
 */
export function mapTwilioCallStatus(twilioStatus: string): string {
  const map: Record<string, string> = {
    queued: "RINGING",
    ringing: "RINGING",
    "in-progress": "ANSWERED",
    completed: "ANSWERED",
    busy: "BUSY",
    failed: "FAILED",
    "no-answer": "MISSED",
    canceled: "REJECTED",
    initiated: "RINGING",
  };
  return map[twilioStatus.toLowerCase()] ?? twilioStatus.toUpperCase();
}

/**
 * Determine call direction from Twilio's direction field.
 * Twilio: "inbound" | "outbound-api" | "outbound-dial" | "trunking-originating"
 *         | "trunking-terminating" | "client" | "test"
 */
export function mapTwilioDirection(twilioDirection: string): "INBOUND" | "OUTBOUND" | "INTERNAL" {
  if (twilioDirection.startsWith("inbound")) return "INBOUND";
  if (twilioDirection.startsWith("outbound")) return "OUTBOUND";
  return "OUTBOUND"; // default
}

/**
 * Validate a recording URL to prevent SSRF attacks.
 * Only allows HTTPS URLs from twilio.com or *.twiliousercontent.com domains.
 */
export function isSafeRecordingUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false; // reject URLs with credentials
    const host = parsed.hostname.toLowerCase();
    // Allow twilio.com (exact) and *.twilio.com and *.twiliousercontent.com
    if (host === "twilio.com" || host.endsWith(".twilio.com")) return true;
    if (host === "twiliousercontent.com" || host.endsWith(".twiliousercontent.com")) return true;
    return false;
  } catch {
    return false;
  }
}
