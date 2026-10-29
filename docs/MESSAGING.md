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
- _*SMTP_* env on the server_* = every company has email. Per-company
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
