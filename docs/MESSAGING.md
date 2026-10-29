# Messaging & Communications Subsystem

How Nirman talks to the outside world — one audit spine, one delivery
queue per channel, zero paid dependencies by default.

## The three layers

```
┌─────────────────────────────────────────────────────────────┐
│ INTENT / AUDIT — NotificationLog + SmsOutbox + BankSms        │
│  what we tried to say, to whom, which channel, the outcome    │
├─────────────────────────────────────────────────────────────┤
│ ROUTING — sendNotification() / sendOtpSms() / sendGatewaySms()│
│  channel union: IN_APP | SMS | EMAIL | WHATSAPP               │
├─────────────────────────────────────────────────────────────┤
│ DELIVERY                                                     │
│  SMS    → device outbox (phone polls /api/sms/outbox) → SIM   │
│           OR URL gateway → provider fallback                  │
│  EMAIL  → per-company SMTP → platform SMTP_* env → stub       │
│  WA     → Meta Cloud API (per-company, optional)              │
│  IN_APP → InAppNotification bell                              │
└─────────────────────────────────────────────────────────────┘
```

Inbound mirror: bank SMS arrives at `/api/sms/intake` (device-key) →
`ingestSmsBatch` parses → matches to receivable/payment → `BankSms` row.

## How each business area uses it

| Area            | Party                       | Channel                | Path                                                    |
| --------------- | --------------------------- | ---------------------- | ------------------------------------------------------- |
| **Auth (OTP)**  | staff / customer / supplier | SMS                    | `sendOtpSms` → company gateway → env gateway → provider |
| **Collections** | customer, tenant            | WA + **SMS** + EMAIL   | `sendPaymentReminders` fan-out per recipient            |
| **Procurement** | supplier                    | WA + SMS               | reminders/PO events via notification prefs              |
| **Compliance**  | finance team                | IN_APP (+SMS if opted) | event-bus → `notification-handlers`                     |
| **HR/Payroll**  | employee                    | IN_APP                 | bell; email when configured                             |
| **Approvals**   | approvers                   | IN_APP + push          | `sendPushToUser` (web + capacitor)                      |
| **Reports**     | admins                      | EMAIL                  | `createEmailProviderFromConfig`                         |

## The zero-setup contract

- **App install → login → one OS prompt** = the company has an SMS
  device. `POST /api/sms/devices` self-mints the key; the native
  `SmsBridge` plugin forwards bank SMS and polls the outbox.
- _\*SMTP_* env on the server_* = every company has email. Per-company
  `EMAIL_SMTP` config only exists as an optional override.
- **No app device?** SMS sends simply don't queue — the business keeps
  working on in-app + email; nothing fails loudly for absent hardware.

## Delivery semantics

- `SmsOutbox`: QUEUED → claimed by device (attempts++) → ack `SENT` or
  retry ≤3 → `FAILED`. Dead devices never lose a message — it stays
  queued for the next poller.
- `NotificationLog`: PENDING → SENT/FAILED with timestamps + error —
  the full audit trail per message per channel.
- `BankSms`: `smsHash` dedupe — redelivery is always harmless.

## Security boundaries

- Device keys are per-phone, hashed-purpose tokens (`SmsIngestToken`),
  revocable independently; intake/outbox are `skipSession` +
  key-authed + rate-limited.
- Personal SMS never leaves the phone — the receiver forwards only
  bank/UPI sender IDs (see `SmsReceiver.BANK_SENDER`).
- Secrets (SMTP/gateway passwords) are encrypted in `IntegrationConfig`
  and masked (`••••••••`) in every list API.

## The whole elephant — gap ledger (round 148)

System-level audit of the complete onboarding + comms lifecycle:

| #   | Gap                                                         | Status                                                          | Impact                                                                       |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Company self-signup (signup → verify → provision → welcome) | OPEN — biggest gap                                              | A new business can't onboard itself; admin/bootstrap creates companies today |
| 2   | Invite-link (set-own-password) vs temp password in transit  | PARTIAL — mustChangePassword mitigates                          | Industrial pattern; moderate build                                           |
| 3   | Employee offer → offer-letter email with accept link        | PARTIAL — `/accept/offer/[token]` exists; send path needs audit | Joining docs + link delivery                                                 |
| 4   | NotificationLog retry/resend for FAILED rows                | OPEN                                                            | Ops recovery for dead device/provider                                        |
| 5   | Welcome for customer/supplier portal users                  | OPEN                                                            | Portal OTP exists, no welcome email/SMS                                      |
| 6   | Deliverability: SPF/PTR/DKIM on nirman.life                 | OPS — one-time platform DNS                                     | Without it relay mail lands in spam                                          |
| 7   | SMS device: key rotation + last-health surface              | PARTIAL — lastUsedAt tracked                                    | Ops hygiene                                                                  |
| 8   | Play variant without SMS perms + signing pipeline           | OPEN — build config                                             | Distribution                                                                 |
| 9   | iOS: no SMS possible (platform limit)                       | INHERENT — document only                                        | —                                                                            |
| 10  | Offline app data (site work without signal)                 | OUT OF SCOPE — WebView architecture                             | Re-architecture if ever required                                             |

Sequenced plan: (2) invite-link first — it upgrades 1+3+5 simultaneously;
(4) retry sweep — reuses the outbox/log lifecycle; (6) DNS alongside;
(8) when APK pipeline exists.
