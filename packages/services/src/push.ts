import { prisma } from "@nirman/db";
import { ALL_PERMISSIONS, ALL_ROLES, hasPermission, isCustomRole } from "@nirman/rbac";
import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import http2 from "node:http2";
import { sign as cryptoSign } from "node:crypto";

/**
 * Web Push notification sender.
 *
 * Sends push notifications to all active push subscriptions for a given user.
 * Uses the `web-push` npm package which handles VAPID authentication and
 * RFC 8291 payload encryption.
 *
 * Required env vars:
 *   VAPID_PUBLIC_KEY  — VAPID public key (base64url)
 *   VAPID_PRIVATE_KEY — VAPID private key (base64url)
 *   VAPID_SUBJECT     — "mailto:" or HTTPS URL for VAPID claims
 *
 * If VAPID keys are not configured, push sending is a no-op (returns 0).
 * The InAppNotification is the primary delivery channel; push is a bonus.
 */

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:noreply@nirman.app";

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  href?: string;
  tag?: string;
  requireInteraction?: boolean;
}

// ── Native (Capacitor) push ────────────────────────────────────────────
// Native device tokens are stored in the same PushSubscription table with
// endpoint = "capacitor://<platform>/<token>". iOS delivers over APNs
// HTTP/2 with token-based auth (a .p8 key from Apple Developer). No extra
// npm deps — node:http2 + crypto cover it.
//
// Required env vars (iOS):
//   APNS_KEY_ID       — 10-char Key ID of the .p8 key
//   APNS_TEAM_ID      — 10-char Apple Team ID
//   APNS_AUTH_KEY_P8  — .p8 key contents (PEM, or base64 of the file)
//   APNS_TOPIC        — bundle id (defaults to "life.nirman.app")
//   APNS_PRODUCTION   — "true" for api.push.apple.com (TestFlight/App Store),
//                       unset/false hits the sandbox (dev builds)
//
// Android native tokens need FCM creds (FCM_* env vars) — flagged below.

const NATIVE_PREFIX = "capacitor://";

function parseNativeEndpoint(
  endpoint: string,
): { platform: string; token: string } | null {
  if (!endpoint.startsWith(NATIVE_PREFIX)) return null;
  const rest = endpoint.slice(NATIVE_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return { platform: rest.slice(0, slash), token: rest.slice(slash + 1) };
}

let apnsJwt: { token: string; issuedAt: number } | null = null;

function apnsConfig(): {
  keyId: string;
  teamId: string;
  key: string;
  topic: string;
  host: string;
} | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  let key = process.env.APNS_AUTH_KEY_P8;
  if (!keyId || !teamId || !key) return null;
  // Env values often arrive base64-encoded or with escaped newlines.
  if (!key.includes("BEGIN")) key = Buffer.from(key, "base64").toString("utf8");
  key = key.replace(/\\n/g, "\n");
  return {
    keyId,
    teamId,
    key,
    topic: process.env.APNS_TOPIC ?? "life.nirman.app",
    host:
      process.env.APNS_PRODUCTION === "true"
        ? "https://api.push.apple.com"
        : "https://api.sandbox.push.apple.com",
  };
}

/** ES256 JWT for APNs, cached — APNs rejects iat older than 1 hour. */
function getApnsJwt(cfg: NonNullable<ReturnType<typeof apnsConfig>>): string {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt && now - apnsJwt.issuedAt < 2400) return apnsJwt.token;
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const signingInput = `${b64({ alg: "ES256", kid: cfg.keyId })}.${b64({ iss: cfg.teamId, iat: now })}`;
  const sig = cryptoSign("sha256", Buffer.from(signingInput), cfg.key).toString(
    "base64url",
  );
  apnsJwt = { token: `${signingInput}.${sig}`, issuedAt: now };
  return apnsJwt.token;
}

const DEAD_TOKEN_REASONS = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

const APNS_PROD = "https://api.push.apple.com";
const APNS_SANDBOX = "https://api.sandbox.push.apple.com";

async function sendApnsTo(
  host: string,
  token: string,
  body: string,
  jwt: string,
  topic: string,
): Promise<"sent" | "invalid" | "error"> {
  return new Promise((resolve) => {
    let done = false;
    const client = http2.connect(host);
    const finish = (v: "sent" | "invalid" | "error") => {
      if (done) return;
      done = true;
      client.close();
      resolve(v);
    };

    client.on("error", () => finish("error"));
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": `${Math.floor(Date.now() / 1000) + 86400}`,
      "content-type": "application/json",
    });
    let status: number | undefined;
    let raw = "";
    req.setEncoding("utf8");
    req.on("response", (headers) => {
      // Coerce — @types/node declares :status as number, but HTTP/2 header
      // values are strings on the wire; don't trust the runtime type.
      const s = Number(headers[":status"]);
      status = Number.isNaN(s) ? undefined : s;
      if (status === 200) finish("sent");
    });
    req.on("data", (chunk: string) => { raw += chunk; });
    req.on("end", () => {
      if (status === 200) return;
      // Only token-level reasons mean the device is gone. Other 400s
      // (BadTopic, PayloadTooLarge, BadExpirationDate…) are server-side
      // config errors — deactivating on them would silently kill every
      // valid device.
      let reason = "";
      try { reason = (JSON.parse(raw) as { reason?: string }).reason ?? ""; } catch {}
      if (status === 410 || DEAD_TOKEN_REASONS.has(reason)) finish("invalid");
      else {
        console.warn(`[push] APNs ${status ?? "?"} ${reason || raw.slice(0, 120)}`);
        finish("error");
      }
    });
    req.on("error", () => finish("error"));
    req.setTimeout(15000, () => finish("error"));
    req.end(body);
  });
}

/**
 * APNs environment mismatch is the common false-negative: a dev-signed
 * build's token returns BadDeviceToken on the production host (and a
 * TestFlight token on sandbox). Since one backend serves both, on
 * "invalid" we retry the other environment once before treating the
 * token as dead.
 */
async function sendApns(
  token: string,
  payload: PushPayload,
): Promise<"sent" | "invalid" | "error"> {
  const cfg = apnsConfig();
  if (!cfg) return "error";
  const jwt = getApnsJwt(cfg);
  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
      ...(payload.tag ? { "thread-id": payload.tag } : {}),
    },
    ...(payload.href ? { href: payload.href } : {}),
  });

  const first = await sendApnsTo(cfg.host, token, body, jwt, cfg.topic);
  if (first !== "invalid") return first;
  const alt = cfg.host === APNS_PROD ? APNS_SANDBOX : APNS_PROD;
  return sendApnsTo(alt, token, body, jwt, cfg.topic);
}

type PushSubRow = {
  id: string;
  endpoint: string;
  p256dhKey: string | null;
  authKey: string | null;
};

/**
 * Deliver a payload to a set of subscription rows — web push via VAPID for
 * browser endpoints, APNs for "capacitor://ios/" device tokens. Android
 * native tokens are stored but skipped until FCM creds (FIREBASE_* env)
 * are wired.
 */
async function deliverToSubs(
  subs: PushSubRow[],
  payload: PushPayload,
): Promise<number> {
  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon,
    href: payload.href,
    tag: payload.tag,
    requireInteraction: payload.requireInteraction ?? false,
  });

  const vapidReady = ensureVapidConfigured();
  let sent = 0;

  for (const sub of subs) {
    const native = parseNativeEndpoint(sub.endpoint);
    if (native) {
      if (native.platform === "ios") {
        const res = await sendApns(native.token, payload);
        if (res === "sent") sent++;
        else if (res === "invalid") {
          await prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { isActive: false },
          });
        }
      }
      // android → needs FCM; token kept for when creds are configured
      continue;
    }

    if (!vapidReady) continue;

    const pushSub: WebPushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dhKey ?? "",
        auth: sub.authKey ?? "",
      },
    };

    try {
      await webpush.sendNotification(pushSub, message, {
        TTL: 86400, // 24 hours
      });
      sent++;
    } catch (err) {
      // 410 Gone / 404 Not Found → subscription is no longer valid
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { isActive: false },
        });
      }
      // Other errors (5xx, network) — don't deactivate, will retry next time
    }
  }

  return sent;
}

/**
 * Send a push notification to all active subscriptions for a user.
 * Returns the number of successfully sent notifications.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const subs = await prisma.pushSubscription.findMany({
    where: { userId, isActive: true },
  });
  if (subs.length === 0) return 0;
  return deliverToSubs(subs, payload);
}

/**
 * Whether a membership role grants `permission` — mirrors
 * `resolveRolePermissions` in the web layer: built-in matrix +
 * RolePermission row overrides + member extras; custom roles resolve via
 * baseRole (inherit) or their own permission list (scratch).
 * `roleGrants` contains role names whose RolePermission rows grant the
 * target permission (already filtered to this company's valid roles).
 */
function roleHasPermission(
  role: string | undefined,
  permission: string,
  roleGrants: Set<string>,
  customByKey: Map<string, { baseRole: string | null; permissions: string[] }>,
  extraPerms: string[],
): boolean {
  const r = role ?? "";
  const grant = roleGrants.has(r) ? [permission] : [];
  if (isCustomRole(r)) {
    const cr = customByKey.get(r);
    if (!cr) return hasPermission("SUPERVISOR", permission);
    if (cr.baseRole) {
      return hasPermission(cr.baseRole, permission, [...cr.permissions, ...grant, ...extraPerms]);
    }
    // Scratch mode: permissions IS the complete set; web intersects with
    // ALL_PERMISSIONS, so unknown permission strings never grant.
    if (!ALL_PERMISSIONS.includes(permission)) return false;
    return cr.permissions.includes(permission) || grant.length > 0 || extraPerms.includes(permission);
  }
  return hasPermission(r, permission, [...grant, ...extraPerms]);
}

/**
 * Every active member of the company whose effective permissions include
 * `permission` — the recipient set `requirePermission(perm)` would let act.
 * Includes live delegations: while a delegation is active the delegate also
 * holds the delegator's primary-role permissions (mirrors getUserPermissions).
 */
async function usersWithPermission(companyId: string, permission: string): Promise<string[]> {
  const [memberships, roleGrantRows, customRoles] = await Promise.all([
    prisma.userCompany.findMany({
      where: { companyId, active: true, user: { active: true } },
      include: { userPermissions: { where: { permission }, select: { permission: true } } },
    }),
    prisma.rolePermission.findMany({ where: { permission }, select: { role: true } }),
    prisma.customRole.findMany({
      where: { companyId },
      select: { key: true, baseRole: true, permissions: true },
    }),
  ]);

  const customByKey = new Map(customRoles.map((c) => [c.key, c]));
  const builtIn = new Set<string>(ALL_ROLES);
  // RolePermission rows are keyed by bare role string with no companyId.
  // Custom role keys are only unique per company — accept a grant only when
  // the role is built-in or a custom key that exists in THIS company.
  const roleGrants = new Set(
    roleGrantRows
      .map((g) => g.role)
      .filter((r) => builtIn.has(r) || customByKey.has(r)),
  );
  const wornRole = (m: (typeof memberships)[number]) =>
    m.activeRole && [m.role, ...(m.secondaryRoles ?? [])].includes(m.activeRole)
      ? m.activeRole
      : m.role;

  // Delegations: while live (started, not yet ended) the delegate also holds
  // the delegator's PRIMARY role permissions.
  const now = new Date();
  const byMembershipId = new Map(memberships.map((m) => [m.id, m]));
  const delegatedEligible = new Set<string>();
  for (const delegator of memberships) {
    if (!delegator.approvalsDelegatedToId || !delegator.delegationEndsAt || delegator.delegationEndsAt <= now) continue;
    if (delegator.delegationStartedAt && delegator.delegationStartedAt > now) continue;
    const delegate = byMembershipId.get(delegator.approvalsDelegatedToId);
    if (!delegate) continue;
    if (roleHasPermission(delegator.role, permission, roleGrants, customByKey, [])) {
      delegatedEligible.add(delegate.userId);
    }
  }

  const eligible = new Set<string>();
  for (const m of memberships) {
    const own = roleHasPermission(
      wornRole(m),
      permission,
      roleGrants,
      customByKey,
      m.userPermissions.map((p) => p.permission),
    );
    if (own || delegatedEligible.has(m.userId)) {
      eligible.add(m.userId);
    }
  }
  return [...eligible];
}

/**
 * Send a push notification to every subscribed member of the company whose
 * role grants `permission` — approver-targeted sends (POs, requisitions,
 * gate passes) without broadcasting to the whole company. For per-user
 * sends use `sendPushToUser` (which is what the event bus calls).
 */
export async function sendPushToApprovers(
  companyId: string,
  permission: string,
  payload: PushPayload,
): Promise<number> {
  const userIds = await usersWithPermission(companyId, permission);
  if (userIds.length === 0) return 0;
  const subs = await prisma.pushSubscription.findMany({
    where: { companyId, isActive: true, userId: { in: userIds } },
  });
  if (subs.length === 0) return 0;
  return deliverToSubs(subs, payload);
}

/** Whether APNs env vars are set (native iOS push delivery possible). */
export function isApnsConfigured(): boolean {
  return apnsConfig() !== null;
}

/**
 * Check if VAPID is configured (for the /api/notifications/vapid-public-key endpoint).
 */
export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Get the VAPID public key for client-side subscription.
 * Returns null if not configured.
 */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}
