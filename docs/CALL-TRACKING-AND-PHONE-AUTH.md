# Call Tracking & Recording + Phone-Based Authentication

> **Status:** Design document — pending review before implementation.
> **Author:** Architecture session, 2026-09-02.
> **Related:** `AGENTS.md` (auth/RBAC section), `docs/ARCHITECTURE.md`,
> `apps/web/src/lib/phone-otp.ts`, `apps/web/src/app/sign-in/page.tsx`.

---

## 1. Overview

Two systems are designed together because they share the same identity
primitive: **the company-issued phone number**.

| System | Purpose |
|---|---|
| **Phone-based authentication** | Staff log in with their company phone number as the user ID + a password the owner/admin issued to them. No "forgot password" — admins reset. Email login remains as a fallback for office/admin staff. |
| **Call tracking & recording** | Every call made or received on a company-issued number is logged, recorded, stored, linked to business entities (customers, suppliers, projects, staff), and made searchable with proper access control and consent management. |

The guiding principle: **the phone number is the staff member's work
identity**. It authenticates them, and it's the channel through which their
work communications are tracked.

---

## 2. The Multi-Company Same-Phone Problem

> *"If a staff member has two accounts with the same phone number for
> different companies — e.g. the parent company has a child company and the
> manager is the same for both — how do we handle login? He's been given just
> one phone number."*

This is the central design question. There are three possible data shapes,
and the system must handle all three gracefully.

### 2.1 The three shapes

| Shape | Description | Example |
|---|---|---|
| **A. One User, multiple `UserCompany` memberships** | A single `User` row with the phone number, linked to two companies via two `UserCompany` rows (each with its own role). | Manager Amit is `PROJECT_MANAGER` at Parent Co and `ADMIN` at Child Co — one account, two memberships. |
| **B. Two User rows, same phone, different passwords** | Two separate `User` records sharing the same `phoneNormalized`, each with its own credential `Account` and password. | The admin created two accounts not realising the person already existed. |
| **C. Two User rows, same phone, same password** | Two separate `User` records, same phone, same password (admin reused the password). | Edge case of B — ambiguous. |

### 2.2 The recommended model: Shape A

**Shape A is the correct model.** One person = one `User` = one phone number.
Their presence at multiple companies is expressed through `UserCompany`
memberships, each with its own role, scope, and reporting line. This is what
the schema already supports (`UserCompany` with `role`, `scopeType`,
`reportsToUserCompanyId`).

When an admin creates a new account and enters a phone number (or email) that
already exists on another `User`, the system should:

1. **Detect the existing user** by `phoneNormalized` (and/or `email`).
2. **Offer to add a `UserCompany` membership** to the existing user instead of
   creating a duplicate `User`.
3. If the admin confirms, create a `UserCompany` row (with the new company +
   role) rather than a new `User`.
4. If the admin insists on a separate account (rare — e.g. a contractor who
   should not see the other company's data even via membership switching),
   allow it but warn that the person will need to remember two passwords.

This eliminates Shape C entirely and makes Shape B a deliberate, warned-against
choice rather than an accident.

### 2.3 Login flow for all three shapes

```
User enters: phone + password
        │
        ▼
POST /api/auth/phone-password
        │
        ▼
Server: normalizePhone(phone) → find all active Users with that phoneNormalized
        │
        ├── 0 users found → "Invalid phone number or password."
        │
        ├── N users found → verify password against each user's credential Account
        │       │
        │       ├── 0 password matches → generic error + rate-limit by phone
        │       │
        │       ├── 1 password match (Shape A or B with unique password):
        │       │       │
        │       │       ├── check account lockout / active status
        │       │       ├── create Better-Auth session (same as phone-otp.ts)
        │       │       ├── if user has >1 UserCompany memberships:
        │       │       │       → return { requiresCompanySelect: true, companies: [...] }
        │       │       │       → client shows company picker (existing pattern)
        │       │       ├── if user.mustChangePassword:
        │       │       │       → return { mustChangePassword: true, sessionToken }
        │       │       │       → client redirects to /change-password
        │       │       └── else → session cookie set, route after login
        │       │
        │       └── >1 password matches (Shape C — same phone, same password):
        │               → return { multiUser: true, users: [{id, name, company, role}] }
        │               → client shows account picker (company name + role shown)
        │               → user picks one → POST /api/auth/phone-password/select
        │                 → creates session for that specific user
        │
        ▼
After login: company scope is set via /api/company/switch (existing flow)
```

**Key decisions:**
- The company picker (Shape A, multiple memberships) is the **same UI** that
  already exists for email login's multi-company flow — no new component needed.
- The account picker (Shape C, truly separate accounts) is the **same UI** that
  already exists for phone-OTP's `select-user` step — no new component needed.
- Rate limiting is per-phone-number (not per-account) to prevent brute-force
  attacks across accounts sharing a number.

### 2.4 Company switching after login

Once logged in, a user with multiple memberships can switch companies via the
existing company switcher (world rail / settings). The active company scope
determines:
- Which calls they see in the call log
- Which company numbers they can use
- Which recordings they can access
- Their role-based permissions for that company

A parent-company OWNER/ADMIN can optionally see child-company calls via a
"include child companies" toggle on the call log (governed by a permission:
`call.view_child_companies`).

---

## 3. Phone + Password Authentication

### 3.1 What changes from the current system

| Current | New |
|---|---|
| Email + password (Better-Auth `signIn.email`) | **Phone + password** (new `signIn.phonePassword` endpoint) as the **default** login mode |
| Phone OTP (send code → verify) | Stays as an alternative, but phone+password is the primary |
| Forgot password (email reset link) | **Removed for phone-based accounts.** Admin resets the password and hands it to the staff member. Email-based accounts (admins) can keep email reset. |
| Password set by user during sign-up | Password set by owner/admin at account creation time. Optional `mustChangePassword` flag forces a change on first login. |
| No account lockout | Lockout after N failed attempts (configurable, default 5). Admin can unlock. |
| `User.phone` / `phoneNormalized` exist but optional | `phoneNormalized` becomes the primary login identifier for staff accounts. Still nullable (email-only admins can have no phone). |

### 3.2 New User fields

```prisma
model User {
  // ... existing fields ...
  phone              String?   // display format: +91 98765 43210
  phoneNormalized    String?   // digits-only: 919876543210 — indexed, used for login lookup
  // ── New auth fields ──
  mustChangePassword Boolean   @default(false)  // force password change on next login
  passwordChangedAt  DateTime?                  // when the user last changed their password
  failedLoginAttempts Int      @default(0)      // counter for lockout
  lockedUntil        DateTime?                  // lockout expiry timestamp
  lastLoginAt        DateTime?                  // last successful login
  lastLoginIp        String?                    // last login IP (audit)
  // ── Consent ──
  monitoringConsentAcceptedAt DateTime?         // when staff accepted the call-monitoring policy
  monitoringConsentPolicyId   String?           // which version of the policy they accepted
}
```

### 3.3 New Company fields

```prisma
model Company {
  // ... existing fields ...
  // ── Call recording config ──
  recordingConsentBeep       Boolean @default(true)   // play "calls may be recorded" beep
  recordingRetentionDays     Int     @default(365)     // how long to keep recordings
  recordingAutoDelete        Boolean @default(false)   // auto-delete after retention period
  recordingStorageProvider   String  @default("s3")    // s3 | local | provider
  // ── Password policy ──
  passwordMinLength          Int     @default(8)
  passwordRequireSpecial     Boolean @default(false)   // for field staff, keep simple
  passwordExpiryDays         Int?                        // null = never expires
  accountLockoutThreshold    Int     @default(5)        // failed attempts before lockout
  accountLockoutDurationMin  Int     @default(30)       // lockout duration in minutes
}
```

### 3.4 API endpoints — authentication

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/phone-password` | Phone + password login. Returns session, or `{ requiresCompanySelect }`, or `{ multiUser }`, or `{ mustChangePassword }`. |
| `POST` | `/api/auth/phone-password/select` | Select a specific user when `multiUser` was returned. |
| `POST` | `/api/users/[id]/reset-password` | Admin resets a user's password. Sets `mustChangePassword = true`. Requires `user.manage`. |
| `POST` | `/api/users/[id]/unlock` | Admin unlocks a locked account. Requires `user.manage`. |
| `POST` | `/api/me/change-password` | User changes their own password (forced on first login, or voluntary). Clears `mustChangePassword`. |
| `GET` | `/api/me/auth-info` | Returns `mustChangePassword`, `failedAttempts`, `locked`, `consentAccepted` for the current session. |

### 3.5 Sign-in page changes

The existing sign-in page has a Phone/Email mode toggle. Changes:

1. **Phone mode becomes phone+password** (not phone+OTP). The form shows:
   - Phone number field (existing)
   - Password field (new — replaces the OTP step)
   - "Sign in" button

2. **OTP stays as a secondary option** — a small "Sign in with code instead"
   link below the password field switches to the existing OTP flow. This is
   useful if a staff member forgot their password and can't reach the admin
   immediately (admin can still disable OTP per-company if desired).

3. **No "Forgot password" link** in phone mode. A note says: *"Forgot your
   password? Contact your administrator to reset it."*

4. **Email mode** keeps the forgot-password link (for admin/office accounts).

5. **First-login password change**: if `mustChangePassword` is true, after
   session creation the client redirects to `/change-password` (new page).
   The page shows: *"This is your first login. Please set a new password."*
   Old password + new password + confirm. On success, `mustChangePassword`
   is cleared and the user is routed to their home world.

6. **Account lockout**: after `accountLockoutThreshold` failed attempts, the
   account is locked for `accountLockoutDurationMin` minutes. The error
   message says: *"Too many failed attempts. Try again in N minutes, or
   contact your administrator."*

### 3.6 Account creation by admin

When an owner/admin creates a staff account (`POST /api/users`):

1. Admin enters: name, phone number, role, company, (optional) email.
2. Admin sets the initial password (or the system generates one and displays
   it once for the admin to communicate to the staff member).
3. **Duplicate detection**: if `phoneNormalized` matches an existing active
   user, the API returns `{ existingUser: true, userId, name, companies: [...] }`
   and asks the admin to choose:
   - "Add company membership to existing user" → creates `UserCompany`
   - "Create separate account" → proceeds with a new `User` (with a warning)
4. `mustChangePassword = true` is set by default (admin can uncheck "require
   password change on first login" if they've already set a personal password
   with the staff member).
5. The credential `Account` is created via Better-Auth's internal adapter
   (same as the demo-login endpoint does).

### 3.7 Password reset by admin

`POST /api/users/[id]/reset-password`:
- Admin enters a new password (or generates one).
- Sets `mustChangePassword = true`.
- Revokes all existing sessions for that user (security).
- Logs a `USER_PASSWORD_RESET` audit entry.
- The admin communicates the new password to the staff member out-of-band
  (in person, by phone, etc.) — the system never sends it via SMS/email.

---

## 4. Call Tracking & Recording System

### 4.1 Architecture overview

```
┌─────────────────┐     webhook      ┌──────────────────┐
│  Cloud Telephony │ ───────────────▶ │  Nirman Web App  │
│  (Exotel /       │   (call events)  │  /api/telephony/ │
│   Knowlarity /   │                  │    webhook       │
│   Twilio)        │                  └────────┬─────────┘
│                  │                           │
│  ┌────────────┐  │                  ┌────────▼─────────┐
│  │ Recording  │  │   recording URL  │  Webhook Handler │
│  │ Storage    │  │ ◀─────────────── │  - parse event   │
│  │ (provider) │  │                  │  - upsert CallLog│
│  └──────┬─────┘  │                  │  - fetch recording│
│         │        │                  │  - link entities  │
└─────────┼────────┘                  └────────┬─────────┘
          │ download recording                 │ store
          ▼                                    ▼
   ┌──────────────┐                   ┌──────────────────┐
   │  Our S3 /    │ ◀──────────────── │  CallRecording   │
   │  Storage     │                   │  (DB metadata)   │
   │  (encrypted) │                   └──────────────────┘
   └──────────────┘
```

**Two ingestion paths:**

1. **Automatic (cloud telephony):** The telephony provider intercepts calls
   via virtual numbers, records them, and sends webhooks to our app. We
   download recordings to our storage. This works for any phone — the staff
   member doesn't need an app.

2. **Manual (fallback / field staff):** Staff log a call manually in the app
   (or mobile app), entering the number, direction, duration, and optionally
   uploading a recording file. This covers company SIMs that aren't on cloud
   telephony, or when a provider isn't configured.

### 4.2 Telephony provider abstraction

The system supports multiple providers behind a common interface. India-focused
providers (Exotel, Knowlarity) are the primary targets; Twilio is the
international fallback.

```typescript
// packages/services/src/telephony/provider.ts
interface TelephonyProvider {
  name: string;
  // Webhook payload → normalized CallEvent
  parseWebhook(body: unknown, headers: Record<string, string>): CallEvent;
  // Fetch recording audio from provider URL → stream
  fetchRecording(recordingUrl: string): Promise<Buffer>;
  // Make an outbound call (connect staff ↔ external party via proxy number)
  connectCall(from: string, to: string, options?: CallOptions): Promise<ProviderCallRef>;
  // Send SMS
  sendSms(to: string, body: string): Promise<ProviderSmsRef>;
}
```

Providers are configured per-company via `TelephonyProviderConfig`. A company
can have zero providers (manual logging only) or one active provider.

### 4.3 Schema — call tracking

```prisma
// ───────────────────────────────────────────────────────────
//  COMPANY PHONE NUMBERS — numbers owned/issued by the company
// ───────────────────────────────────────────────────────────
model CompanyPhone {
  id              String   @id @default(cuid())
  companyId       String
  phoneNumber     String                    // display: +91 98765 43210
  phoneNormalized String                    // 919876543210 — indexed for lookup
  numberType      String   @default("VIRTUAL") // VIRTUAL | MOBILE | LANDLINE | TOLL_FREE
  provider        String?                   // EXOTEL | KNOWLARITY | TWILIO | MANUAL
  providerNumberId String?                  // provider's internal ID for this number
  department      String?                   // "Sales", "Procurement", "Reception"
  label           String?                   // "Main reception", "Site office - Project A"
  // Assignment — who currently has this number
  assignedToUserId String?
  assignedAt      DateTime?
  // Status
  status          String   @default("ACTIVE") // ACTIVE | INACTIVE | RECYCLED | SUSPENDED
  monthlyCost     Decimal? @db.Decimal(14, 2)
  acquiredAt      DateTime @default(now())
  // Consent beep config override (null = use company default)
  consentBeep     Boolean?
  deletedAt       DateTime?

  company         Company  @relation(fields: [companyId], references: [id])
  assignedTo      User?    @relation(fields: [assignedToUserId], references: [id])
  assignments     PhoneAssignment[]
  calls           CallLog[]
  smsLogs         SmsLog[]
  ivrMenu         IvrMenu?

  @@index([companyId])
  @@index([phoneNormalized])
  @@index([assignedToUserId])
}

// ── Assignment history — who had which number, when, why ──
model PhoneAssignment {
  id              String   @id @default(cuid())
  companyPhoneId  String
  userId          String
  assignedAt      DateTime @default(now())
  returnedAt      DateTime?
  reason          String?  // "Staff joined", "Staff left", "Number recycled"
  assignedById    String?

  companyPhone    CompanyPhone @relation(fields: [companyPhoneId], references: [id])
  user            User         @relation(fields: [userId], references: [id])
  assignedBy      User         @relation("PhoneAssignmentAssigner", fields: [assignedById], references: [id])

  @@index([companyPhoneId])
  @@index([userId])
}

// ───────────────────────────────────────────────────────────
//  CALL LOG — every call event (automatic or manual)
// ───────────────────────────────────────────────────────────
model CallLog {
  id              String   @id @default(cuid())
  companyId       String
  // Direction
  direction       String   // INBOUND | OUTBOUND | INTERNAL (staff-to-staff)
  // Parties
  fromNumber      String                    // caller's number (normalized)
  toNumber        String                    // callee's number (normalized)
  companyPhoneId  String?                   // which company number was involved
  callerUserId    String?                   // staff member who made/received the call
  calleeUserId    String?                   // if the other party is also staff
  // Linked business entities (auto-matched by number, or manually linked)
  relatedCustomerId   String?
  relatedSupplierId   String?
  relatedProjectId    String?
  relatedLeadId       String?               // if a lead/crm module exists
  // Call status & timing
  status          String   // RINGING | ANSWERED | MISSED | BUSY | REJECTED | FAILED | VOICEMAIL
  startedAt       DateTime                  // when the call attempt began
  connectedAt     DateTime?                 // when the call was answered
  endedAt         DateTime?                 // when the call ended
  durationSec     Int      @default(0)      // talk time (connected → ended)
  ringDurationSec Int      @default(0)      // ringing time (start → connect)
  // Recording
  recordingId     String?                   // FK to CallRecording (if recorded)
  recordingConsent Boolean @default(false)  // was consent beep played / policy in effect
  // Staff disposition & notes
  disposition     String?                   // CONNECTED | VOICEMAIL_LEFT | CALLBACK_REQUESTED | FOLLOW_UP | DEAL_CLOSED | COMPLAINT | INQUIRY | OTHER
  notes           String?                   // free-text call notes
  // Cost
  callCost        Decimal? @db.Decimal(14, 2) // telecom charge for this call
  // Provider reference
  provider        String?                   // EXOTEL | KNOWLARITY | MANUAL
  providerCallId  String?                   // provider's call ID for cross-reference
  // Source
  source          String   @default("AUTO") // AUTO (webhook) | MANUAL (staff entered) | APP (mobile app)
  // Soft delete (for GDPR/right-to-be-forgotten on customer request)
  deletedAt       DateTime?
  // Legal hold — prevents auto-deletion even after retention expires
  legalHold       Boolean  @default(false)

  company         Company  @relation(fields: [companyId], references: [id])
  companyPhone    CompanyPhone? @relation(fields: [companyPhoneId], references: [id])
  caller          User?    @relation("CallLogCaller", fields: [callerUserId], references: [id])
  callee          User?    @relation("CallLogCallee", fields: [calleeUserId], references: [id])
  recording       CallRecording?
  notes2          CallNote[]               // multiple notes allowed
  tags            CallLogTag[]
  accessLogs      RecordingAccessLog[]
  voicemail       Voicemail?

  @@index([companyId, startedAt])
  @@index([companyPhoneId])
  @@index([callerUserId])
  @@index([fromNumber])
  @@index([toNumber])
  @@index([status])
  @@index([relatedProjectId])
}

// ───────────────────────────────────────────────────────────
//  CALL RECORDING — audio file metadata + storage
// ───────────────────────────────────────────────────────────
model CallRecording {
  id              String   @id @default(cuid())
  callLogId       String   @unique
  // Storage
  storageUrl      String                    // s3://bucket/path/file.mp3 or /local/path
  storageProvider String   @default("s3")   // s3 | local | provider
  fileSizeBytes   Int?
  format          String   @default("mp3")  // mp3 | wav | ogg
  durationSec     Int
  checksum        String?                   // for integrity verification
  encryptionKeyRef String?                  // KMS key ID if encrypted
  // Lifecycle
  uploadedAt      DateTime  @default(now())
  expiresAt       DateTime?                 // retention expiry (auto-delete after)
  deletedAt       DateTime?                 // soft-deleted (purged from storage)
  // Transcription (optional, AI)
  transcriptUrl   String?
  transcriptText  String?                   // full text (if small enough)
  transcriptStatus String  @default("NONE") // NONE | PENDING | COMPLETED | FAILED
  // Access tracking
  accessCount     Int      @default(0)

  callLog         CallLog  @relation(fields: [callLogId], references: [id])
  accessLogs      RecordingAccessLog[]

  @@index([expiresAt])
}

// ── Who listened to / downloaded a recording (compliance audit) ──
model RecordingAccessLog {
  id          String   @id @default(cuid())
  recordingId String
  userId      String
  action      String   // PLAYED | DOWNLOADED | DELETED | SHARED
  accessedAt  DateTime @default(now())
  ipAddress   String?
  userAgent   String?

  recording   CallRecording @relation(fields: [recordingId], references: [id])
  user        User          @relation(fields: [userId], references: [id])

  @@index([recordingId, accessedAt])
}

// ───────────────────────────────────────────────────────────
//  CALL NOTES, TAGS, DISPOSITIONS
// ───────────────────────────────────────────────────────────
model CallNote {
  id          String   @id @default(cuid())
  callLogId   String
  userId      String
  note        String
  createdAt   DateTime @default(now())

  callLog     CallLog  @relation(fields: [callLogId], references: [id])
  user        User     @relation(fields: [userId], references: [id])

  @@index([callLogId])
}

model CallTag {
  id          String   @id @default(cuid())
  companyId   String
  name        String
  color       String   @default("#6b7280") // hex color for UI badge

  company     Company  @relation(fields: [companyId], references: [id])
  callLogs    CallLogTag[]

  @@unique([companyId, name])
}

model CallLogTag {
  id          String   @id @default(cuid())
  callLogId   String
  callTagId   String

  callLog     CallLog  @relation(fields: [callLogId], references: [id])
  callTag     CallTag  @relation(fields: [callTagId], references: [id])

  @@unique([callLogId, callTagId])
}

// ───────────────────────────────────────────────────────────
//  VOICEMAIL
// ───────────────────────────────────────────────────────────
model Voicemail {
  id          String   @id @default(cuid())
  callLogId   String   @unique
  audioUrl    String
  durationSec Int
  transcription String?                  // AI transcription of voicemail
  listenedAt  DateTime?                  // when staff first listened
  listenedById String?
  createdAt   DateTime @default(now())

  callLog     CallLog  @relation(fields: [callLogId], references: [id])
  listenedBy  User?    @relation(fields: [listenedById], references: [id])
}

// ───────────────────────────────────────────────────────────
//  SMS LOG — for completeness (SMS via company numbers)
// ───────────────────────────────────────────────────────────
model SmsLog {
  id              String   @id @default(cuid())
  companyId       String
  direction       String   // INBOUND | OUTBOUND
  fromNumber      String
  toNumber        String
  companyPhoneId  String?
  body            String
  status          String   @default("SENT") // SENT | DELIVERED | FAILED | RECEIVED
  sentAt          DateTime @default(now())
  deliveredAt     DateTime?
  providerMessageId String?
  relatedCallLogId String?                 // if SMS is a follow-up to a call
  dltTemplateId   String?                  // India DLT compliance

  company         Company  @relation(fields: [companyId], references: [id])
  companyPhone    CompanyPhone? @relation(fields: [companyPhoneId], references: [id])

  @@index([companyId, sentAt])
  @@index([companyPhoneId])
}

// ───────────────────────────────────────────────────────────
//  TELEPHONY PROVIDER CONFIG — per-company provider settings
// ───────────────────────────────────────────────────────────
model TelephonyProviderConfig {
  id          String   @id @default(cuid())
  companyId   String
  provider    String   // EXOTEL | KNOWLARITY | TWILIO
  apiKeyRef   String                     // encrypted reference (not the raw key)
  apiSecretRef String                    // encrypted reference
  webhookUrl  String                     // our webhook URL for this provider
  settings    Json?                      // provider-specific config
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  company     Company  @relation(fields: [companyId], references: [id])

  @@index([companyId])
}

// ───────────────────────────────────────────────────────────
//  CONSENT — call monitoring policy + staff acceptance
// ───────────────────────────────────────────────────────────
model ConsentPolicy {
  id          String   @id @default(cuid())
  companyId   String
  version     Int      @default(1)        // incremented on each revision
  policyText  String                      // the full policy text
  effectiveAt DateTime @default(now())
  retiredAt   DateTime?                   // when superseded by a new version
  createdById String?

  company     Company  @relation(fields: [companyId], references: [id])
  acceptances ConsentAcceptance[]

  @@index([companyId, effectiveAt])
}

model ConsentAcceptance {
  id              String   @id @default(cuid())
  consentPolicyId String
  userId          String
  acceptedAt      DateTime @default(now())
  ipAddress       String?
  userAgent       String?

  consentPolicy   ConsentPolicy @relation(fields: [consentPolicyId], references: [id])
  user            User          @relation(fields: [userId], references: [id])

  @@unique([consentPolicyId, userId])
}

// ───────────────────────────────────────────────────────────
//  IVR MENU (optional — auto-attendant for inbound calls)
// ───────────────────────────────────────────────────────────
model IvrMenu {
  id              String   @id @default(cuid())
  companyPhoneId  String   @unique
  greetingAudioUrl String?                 // "Press 1 for sales, 2 for support..."
  menuConfig      Json                     // [{ key: "1", action: "FORWARD", target: "+91..." }, ...]
  updatedAt       DateTime @updatedAt

  companyPhone    CompanyPhone @relation(fields: [companyPhoneId], references: [id])
}
```

### 4.4 API endpoints — call tracking

| Method | Path | Purpose | Permission |
|---|---|---|---|
| `POST` | `/api/telephony/webhook` | Provider webhook receiver (no auth — verified by signature) | — |
| `GET` | `/api/calls` | List calls (filterable: date, staff, direction, status, entity, tag) | `call.view` |
| `GET` | `/api/calls/[id]` | Call detail (metadata, recording URL, notes, tags, linked entities) | `call.view` |
| `PATCH` | `/api/calls/[id]` | Update disposition, notes, linked entities | `call.edit` |
| `POST` | `/api/calls/[id]/notes` | Add a note to a call | `call.edit` |
| `POST` | `/api/calls/[id]/tags` | Add/remove tags | `call.edit` |
| `GET` | `/api/calls/[id]/recording` | Get a signed recording URL (logs access) | `call.recording.listen` |
| `POST` | `/api/calls` | Manually log a call (staff entry) | `call.create` |
| `POST` | `/api/calls/[id]/recording/upload` | Upload a recording file for a manual call | `call.create` |
| `DELETE` | `/api/calls/[id]` | Soft-delete a call (GDPR / customer request) | `call.delete` |
| `POST` | `/api/calls/[id]/legal-hold` | Toggle legal hold | `call.manage` |
| `GET` | `/api/telephony/numbers` | List company phone numbers | `telephony.view` |
| `POST` | `/api/telephony/numbers` | Add a company phone number | `telephony.manage` |
| `PATCH` | `/api/telephony/numbers/[id]` | Update number (assign, status, label) | `telephony.manage` |
| `DELETE` | `/api/telephony/numbers/[id]` | Soft-delete (recycle) a number | `telephony.manage` |
| `GET` | `/api/telephony/numbers/[id]/assignments` | Assignment history for a number | `telephony.view` |
| `POST` | `/api/telephony/providers` | Configure a telephony provider | `telephony.manage` |
| `PATCH` | `/api/telephony/providers/[id]` | Update provider config | `telephony.manage` |
| `GET` | `/api/telephony/consent` | Get current consent policy | `call.view` |
| `POST` | `/api/telephony/consent` | Create/revise consent policy | `telephony.manage` |
| `POST` | `/api/telephony/consent/accept` | Staff accepts the monitoring policy | (any authenticated) |
| `GET` | `/api/reports/calls` | Call analytics (volume, duration, missed rate, staff performance) | `call.view` |
| `GET` | `/api/reports/calls/export` | CSV export of call log | `call.view` |

### 4.5 Webhook handler flow

```
Provider sends POST /api/telephony/webhook
        │
        ▼
1. Verify webhook signature (provider-specific HMAC)
   └── invalid → 403
        │
        ▼
2. Parse event → normalized CallEvent
   { type, direction, from, to, providerCallId, status, timestamps, recordingUrl? }
        │
        ▼
3. Find the CompanyPhone by toNumber (inbound) or fromNumber (outbound)
   └── unknown number → log as "untracked" (still store, flag for review)
        │
        ▼
4. Upsert CallLog (by providerCallId — events arrive in sequence:
   RINGING → ANSWERED → ENDED, or RINGING → MISSED)
        │
        ▼
5. Auto-match parties:
   - fromNumber/toNumber → User (by phoneNormalized) → callerUserId/calleeUserId
   - fromNumber/toNumber → Customer (by phone) → relatedCustomerId
   - fromNumber/toNumber → Supplier (by phone) → relatedSupplierId
        │
        ▼
6. If recordingUrl provided:
   - Download recording from provider
   - Upload to our S3 (encrypted)
   - Create CallRecording row
   - Set expiresAt = now() + company.recordingRetentionDays
   - Link to CallLog
        │
        ▼
7. Post-call notifications:
   - Missed call → in-app + push notification to assignedToUserId
   - Voicemail → notification to assignedToUserId
        │
        ▼
8. Audit log: TELEPHONY_WEBHOOK_RECEIVED
```

### 4.6 Recording storage & lifecycle

- **Storage:** S3-compatible (AWS S3, MinIO, Cloudflare R2). Recordings
  encrypted at rest (SSE-S3 or SSE-KMS). The `encryptionKeyRef` on
  `CallRecording` stores the KMS key ID.
- **Signed URLs:** Recordings are never served directly. `GET
  /api/calls/[id]/recording` generates a time-limited signed URL (5 min
  expiry) and logs a `RecordingAccessLog` entry (PLAYED).
- **Retention:** `CallRecording.expiresAt = uploadedAt +
  company.recordingRetentionDays`. A daily cron job checks for expired
  recordings (where `legalHold = false`) and deletes them from storage +
  sets `deletedAt`.
- **Legal hold:** If `CallLog.legalHold = true`, the recording is never
  auto-deleted regardless of expiry. Used for litigation hold.
- **Access audit:** Every play/download/delete is logged in
  `RecordingAccessLog`. Visible to admins on the call detail page.

### 4.7 Consent management

**Two layers (both required):**

1. **One-time policy acceptance:** When a staff member is assigned a company
   phone number (or on first login after a policy update), they must accept
   the call-monitoring policy. The `ConsentPolicy` stores the full text +
   version. `ConsentAcceptance` records who accepted which version + when +
   IP. If a new policy version is published, all staff must re-accept on next
   login. Until accepted, they see a blocking consent screen (can't access
   the app).

2. **Per-call consent beep:** If `company.recordingConsentBeep = true` (or
   `CompanyPhone.consentBeep` override), the telephony provider plays an
   automated "This call may be recorded for quality and training purposes"
   beep at call start. The `CallLog.recordingConsent` flag records whether
   the beep was played.

**UI:**
- Settings → Communication Monitoring Policy: admin can view/edit/publish
  policy text. Versioning is automatic.
- On login (if policy not accepted or new version): full-screen consent
  page with the policy text + "I understand and accept" button.
- Call detail page shows a "Consent: beep played + policy accepted" badge.

---

## 5. UI Design

### 5.1 Desktop pages

| Path | Page | Description |
|---|---|---|
| `/calls` | Call Log | Filterable table: date/time, direction icon, from→to, duration, status badge, staff, linked entity, disposition, recording play button. Filters: date range, direction, status, staff, company phone, tag, linked entity. Search by number. |
| `/calls/[id]` | Call Detail | Full call metadata, recording player (waveform + play/pause + download), transcription (if available), notes (add/list), tags, linked entities (with links to customer/supplier/project), access log (admin), disposition selector. |
| `/telephony` | Telephony Dashboard | Overview: active numbers, calls today, missed calls, recordings storage usage. Tabs: Numbers, Providers, Consent, IVR. |
| `/telephony/numbers` | Number Management | Table of company numbers: number, type, provider, assigned to, status, monthly cost. Actions: add, assign/unassign, edit, recycle. Assignment history drawer. |
| `/telephony/providers` | Provider Config | Configure Exotel/Knowlarity/Twilio: API keys, webhook URL, test connection. |
| `/telephony/consent` | Consent Policy | View current policy, edit + publish new version, see acceptance status per staff. |
| `/reports/calls` | Call Analytics | Charts: call volume over time, missed call rate, avg duration by staff, calls by hour/day, disposition distribution, cost summary. Date range filter. CSV export. Print. |
| `/change-password` | First-login / voluntary change | Old password + new + confirm. Shown on first login (`mustChangePassword`). |

### 5.2 Mobile pages (`/m/calls`)

Field staff need a lightweight call log on mobile:
- `/m/calls` — recent calls list (compact cards: direction icon, number,
  duration, time, status). Tap → detail with recording player.
- `/m/calls/new` — manual call log entry (number, direction, duration,
  notes, link to project/customer, optional photo of handwritten note).
- `/m/calls/[id]` — call detail with inline recording player, notes, tags.

### 5.3 Sign-in page changes

- Phone mode: phone field + password field (replaces OTP step).
- "Sign in with code instead" link → switches to existing OTP flow.
- No "Forgot password" in phone mode. Note: "Contact your administrator."
- Email mode: unchanged (keeps forgot-password).
- After login: if `mustChangePassword` → redirect to `/change-password`.
- After login: if consent not accepted → redirect to `/consent` (blocking).

### 5.4 Settings additions

- **Me → Security:** change password, view last login, active sessions.
- **Me → Consent:** view accepted monitoring policy, re-accept if new version.
- **Admin → Team → [user]:** reset password, unlock account, assign phone
  number, view consent status.
- **Admin → Company → Communication:** recording config (beep, retention,
  auto-delete), password policy, lockout config, consent policy editor.

---

## 6. What Real Companies Face — Edge Cases & Scenarios

### 6.1 Staff lifecycle

| Scenario | Handling |
|---|---|
| **Staff joins** | Admin creates account with phone + temp password. Number assigned via `PhoneAssignment`. Consent policy must be accepted on first login. `mustChangePassword = true`. |
| **Staff leaves** | Admin deactivates account (`active = false`), revokes all sessions, unassigns number (`PhoneAssignment.returnedAt = now()`). Number goes to `UNASSIGNED` pool. Calls remain in the system for retention period. |
| **Staff loses phone** | Admin suspends the number (`status = SUSPENDED`), issues a replacement SIM/number, reassigns. Old number's calls remain accessible. If the number was a virtual number, it can be re-pointed to the new SIM instantly. |
| **Staff transfers between companies** | If same group: add a `UserCompany` membership at the new company, optionally remove the old one. Number may stay the same if it's a group-level number, or be reassigned. |
| **Temporary / contract staff** | Create account with an `endDate` (new optional field). Auto-deactivate on that date. Number auto-unassigned. |
| **Staff forgets password** | No self-service reset. Staff contacts admin → admin resets → admin communicates new password in person/by phone. `mustChangePassword = true` forces a change on next login. |

### 6.2 Number management

| Scenario | Handling |
|---|---|
| **Number recycling** | When a number is unassigned, it goes to a pool. Before reassigning to a new staff member, the admin sees a warning: "This number was previously used by [Name]. Old calls will remain linked to the previous staff member." |
| **Shared numbers** (reception, site office) | A `CompanyPhone` can be `assignedToUserId = null` with a `label = "Reception"`. Calls to this number are unassigned until a staff member claims them (clicks "This was my call" on the call log). |
| **Personal number used for work** (BYOD) | Staff can log calls from their personal number manually. These are marked `source = MANUAL` and `companyPhoneId = null`. No auto-recording (can't record a personal line). |
| **Number portability** | If a company number is ported to a new provider, update `CompanyPhone.provider` + `providerNumberId`. Call history is preserved (linked by `phoneNormalized`, not provider ID). |
| **Toll-free numbers** | `numberType = TOLL_FREE`. Inbound only. Calls are distributed to staff via IVR/queue. Cost tracked per call. |

### 6.3 Call scenarios

| Scenario | Handling |
|---|---|
| **Missed call after hours** | Call status = `MISSED`. If voicemail is enabled, `Voicemail` record created. Notification sent to assigned staff (in-app + push). If after-hours routing is configured, call is forwarded to an alternate number or goes to voicemail. |
| **Customer calls, no one answers** | Missed call alert → notification to all staff in the relevant department. The call log shows the customer's number (auto-matched to `Customer` if known, or flagged as "new lead" if unknown). |
| **Call about a specific project** | Staff links the call to the project post-call (or auto-linked if the customer/supplier is project-specific). The call appears in the project's communication timeline. |
| **Conference call** | Multiple `CallLog` entries linked by a shared `conferenceId` (optional future field). Each leg is a separate recording. |
| **Call forwarding** | If a call is forwarded from staff A to staff B, two `CallLog` entries: one for the inbound leg (customer → A), one for the forwarded leg (A → B). Both linked by `providerCallId` family. |
| **International call** | Flagged in the UI. Cost tracked separately. Optional policy to block international outgoing. |
| **Spam / fraud call** | Staff marks disposition = `OTHER` + tag = "Spam". Number can be added to a blocklist (future: `BlockedNumber` model). |
| **Call quality issues** | If provider reports quality metrics (MOS, jitter), store on `CallLog` as JSON. Show a quality indicator on the call detail. |

### 6.4 Recording scenarios

| Scenario | Handling |
|---|---|
| **Recording fails** | `CallRecording.transcriptStatus = FAILED` (or recording status on CallLog). Call log still exists; recording column shows "Recording unavailable." |
| **Customer requests recording deletion** (GDPR / right to be forgotten) | Admin soft-deletes the call (`deletedAt = now()`). Recording is purged from storage. `RecordingAccessLog` entries are retained for audit. The call metadata may be retained (anonymized) for aggregate analytics. |
| **Legal hold** | `CallLog.legalHold = true` → recording never auto-deleted. Admin must explicitly release the hold before deletion. |
| **Recording too long** | No hard limit (provider-dependent). Large files stored in S3 with multipart upload. Duration shown on call detail. |
| **Recording access by unauthorized staff** | `RecordingAccessLog` tracks every access. Admins can audit who listened to which recording. Unauthorized access attempts are logged and flagged. |
| **Storage cost management** | Admin dashboard shows total recording storage usage + projected cost. Retention policy can be tightened to reduce storage. Old recordings auto-purged. |

### 6.5 Compliance & legal

| Scenario | Handling |
|---|---|
| **Recording consent beep** | Played automatically by the telephony provider if `recordingConsentBeep = true`. `CallLog.recordingConsent` records whether it was played. |
| **Policy not accepted** | Staff cannot access the app until they accept the current consent policy version. Blocking screen on login. |
| **Policy update** | New `ConsentPolicy` version published → all staff must re-accept on next login. Old acceptances are retained for audit. |
| **TRAI / DLT compliance (India)** | SMS messages require DLT template registration. `SmsLog.dltTemplateId` stores the registered template ID. Outbound SMS without a registered template is blocked. |
| **Data residency** | If required, S3 bucket can be in a specific region. Provider data stays in India (Exotel/Knowlarity are India-hosted). |
| **Court subpoena for recordings** | Admin can export specific recordings + access logs + call metadata as a bundle. Legal hold prevents deletion during litigation. |

### 6.6 Multi-company scenarios

| Scenario | Handling |
|---|---|
| **Same person, parent + child company** | One `User`, two `UserCompany` memberships. Login with phone+password → company picker. Switch companies via existing switcher. Calls are per-company (the `companyId` on `CallLog` determines visibility). |
| **Parent admin viewing child calls** | `call.view_child_companies` permission → toggle "include child companies" on the call log. Shows calls from all child companies. |
| **Number belongs to parent, used at child** | `CompanyPhone.companyId = parent`. Calls to that number are `companyId = parent`. If the child staff member handles the call, `callerUserId` links to them (cross-company). Visibility: parent sees it; child sees it only if the staff member is a member of the child company. |
| **Separate accounts at two companies (Shape B)** | Two `User` rows, same phone, different passwords. Phone+password uniquely identifies which account. Each account sees only its own company's calls. |

---

## 7. Permissions (RBAC additions)

New permission keys to add to `@/lib/roles`:

```
call.view           — view call log
call.view_all       — view all calls (not just own)
call.view_child_companies — view child company calls
call.create         — manually log a call
call.edit           — edit disposition, notes, tags, link entities
call.delete         — soft-delete a call (GDPR)
call.manage         — legal hold, bulk operations
call.recording.listen — play/download recordings
call.recording.delete — delete recordings
telephony.view      — view phone numbers, provider config
telephony.manage    — add/edit numbers, configure providers, publish consent policy
call.analytics      — view call analytics reports
```

**Default role mapping:**

| Permission | OWNER | ADMIN | PROJECT_MANAGER | SUPERVISOR | ACCOUNTANT | SALES_MANAGER |
|---|---|---|---|---|---|---|
| `call.view` | ✓ | ✓ | ✓ | ✓ (own only) | — | ✓ |
| `call.view_all` | ✓ | ✓ | ✓ | — | — | — |
| `call.view_child_companies` | ✓ | ✓ | — | — | — | — |
| `call.create` | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `call.edit` | ✓ | ✓ | ✓ | ✓ (own) | — | ✓ |
| `call.delete` | ✓ | ✓ | — | — | — | — |
| `call.manage` | ✓ | ✓ | — | — | — | — |
| `call.recording.listen` | ✓ | ✓ | ✓ | ✓ (own) | — | ✓ |
| `call.recording.delete` | ✓ | ✓ | — | — | — | — |
| `telephony.view` | ✓ | ✓ | — | — | — | — |
| `telephony.manage` | ✓ | ✓ | — | — | — | — |
| `call.analytics` | ✓ | ✓ | ✓ | — | — | ✓ |

---

## 8. Notifications

Leverage the existing notification system (`InAppNotification` +
`PushSubscription`):

| Event | Recipients | Channel |
|---|---|---|
| Missed call on assigned number | `assignedToUserId` | In-app + push |
| Voicemail received | `assignedToUserId` | In-app + push |
| New call linked to my project | Project manager | In-app |
| Call from a known customer | Account manager / sales | In-app |
| Consent policy updated | All staff in company | In-app (blocking on login) |
| Recording deletion (GDPR) | Admin | In-app (audit) |
| Storage usage threshold (80%) | Admin | In-app + email |
| Daily call summary | Managers (opt-in) | In-app digest |

---

## 9. Analytics & Reporting

### 9.1 Call analytics page (`/reports/calls`)

**Filters:** date range, company phone, staff, direction, status, department.

**Metrics:**
- Total calls (inbound / outbound / missed)
- Missed call rate (%)
- Average call duration
- Average answer time (ring duration)
- Calls per staff member (handled / missed / avg duration)
- Calls per hour / day of week (heatmap)
- Call disposition distribution (pie chart)
- Call cost total + per staff
- Top callers (by frequency) — customers/suppliers who call most
- Recording storage usage + cost

**Exports:** CSV (call log), PDF (summary report), print-friendly view.

### 9.2 Staff performance metrics

Per staff member:
- Calls handled (inbound + outbound)
- Missed calls (on their assigned number)
- Average call duration
- Follow-up rate (calls with disposition = FOLLOW_UP that have a subsequent call)
- Calls linked to business entities (vs unlinked) — measures CRM discipline

---

## 10. Implementation Phases

### Phase 1 — Phone + Password Auth (foundation)
1. Add new `User` fields (`mustChangePassword`, `failedLoginAttempts`,
   `lockedUntil`, `passwordChangedAt`, `lastLoginAt`, consent fields).
2. Add new `Company` fields (password policy, lockout config, recording config).
3. Implement `POST /api/auth/phone-password` endpoint (with multi-user +
   multi-company + lockout logic).
4. Implement `POST /api/auth/phone-password/select` (account picker).
5. Implement admin password reset + unlock endpoints.
6. Implement `POST /api/me/change-password` + `/change-password` page.
7. Update sign-in page: phone mode → phone+password (keep OTP as secondary).
8. Update account creation flow: duplicate phone detection → offer
   `UserCompany` membership.
9. Remove forgot-password UI for phone mode.
10. Add account lockout UI (error messages, admin unlock).

### Phase 2 — Call Tracking Core (manual + schema)
1. Add all call-tracking Prisma models (`CompanyPhone`, `PhoneAssignment`,
   `CallLog`, `CallRecording`, `RecordingAccessLog`, `CallNote`, `CallTag`,
   `CallLogTag`, `Voicemail`, `SmsLog`).
2. Implement manual call logging API (`POST /api/calls`) + UI (`/calls`,
   `/calls/[id]`).
3. Implement `CompanyPhone` management API + UI (`/telephony/numbers`).
4. Implement auto-matching (number → customer/supplier/staff).
5. Implement recording upload for manual calls.
6. Implement signed recording URL endpoint with access logging.
7. Implement call notes, tags, disposition.
8. Add call log to mobile (`/m/calls`, `/m/calls/new`, `/m/calls/[id]`).
9. Add permissions to `@/lib/roles`.
10. Add nav items (role-gated).

### Phase 3 — Cloud Telephony Integration
1. Implement `TelephonyProvider` interface + Exotel/Knowlarity/Twilio adapters.
2. Implement `TelephonyProviderConfig` API + UI (`/telephony/providers`).
3. Implement webhook handler (`POST /api/telephony/webhook`) with signature
   verification.
4. Implement recording download → S3 storage pipeline.
5. Implement recording retention cron job (auto-delete expired).
6. Implement missed call + voicemail notifications.
7. Implement IVR menu config (optional).
8. Implement SMS logging (`SmsLog`) + DLT template management.

### Phase 4 — Consent & Compliance
1. Implement `ConsentPolicy` + `ConsentAcceptance` models (already in Phase 2
   schema, wire up here).
2. Implement consent policy editor UI (`/telephony/consent`).
3. Implement blocking consent screen on login (if not accepted / new version).
4. Implement consent beep config (per-company + per-number override).
5. Implement `RecordingAccessLog` audit view on call detail.
6. Implement legal hold toggle.
7. Implement GDPR deletion flow (soft-delete call + purge recording).

### Phase 5 — Analytics & Reporting
1. Implement `GET /api/reports/calls` (aggregate queries).
2. Implement `/reports/calls` page (charts, filters, export).
3. Implement staff performance metrics.
4. Implement daily call summary digest (opt-in notification).
5. Implement storage usage dashboard.

### Phase 6 — Advanced (future)
- AI transcription of recordings (Whisper API).
- Call barge/whisper (supervisor joins live call).
- Call queuing + routing rules.
- WhatsApp Business message tracking.
- Number masking (proxy numbers for lead privacy).
- Call coaching analytics (sentiment analysis).
- International call policy engine.
- Conference call support.
- API for third-party CRM sync.

---

## 11. Trade-offs & Decisions

| Decision | Rationale |
|---|---|
| **Phone+password (not OTP-only)** | OTP requires SMS delivery (cost, delay, DLT compliance). Password is simpler for field staff who may have poor connectivity. Admin-issued password = no SMS dependency. OTP kept as fallback. |
| **Keep email login** | Admins/office staff may prefer email. Email is also needed for Better-Auth's internal operations. Removing it entirely would be a larger refactor with no clear benefit. |
| **No forgot-password for phone accounts** | Owner's explicit requirement. Prevents account takeover via SIM-swap + SMS reset. Admin reset is more secure (out-of-band password delivery). |
| **Cloud telephony as primary, manual as fallback** | Cloud telephony (Exotel/Knowlarity) is the only way to auto-record calls on any phone without requiring a staff app. Manual logging covers gaps. |
| **Recording stored in our S3, not provider** | Provider recording URLs expire. We own the data, control retention, can encrypt, and aren't locked in. |
| **One User + multiple UserCompany (Shape A) recommended** | Avoids duplicate accounts, shared passwords, and identity fragmentation. The schema already supports it. Duplicate detection at account creation prevents accidental Shape B/C. |
| **Consent: both beep + policy** | Owner's choice. Strongest legal coverage. Beep satisfies per-call consent; policy satisfies informed consent. |
| **Legal hold on calls** | Real companies face litigation. Without legal hold, auto-deletion could destroy evidence. |
| **Soft-delete calls (not hard delete)** | Audit trail. Even when a customer requests deletion, metadata is retained (anonymized) for analytics compliance. |
| `CallLog` is per-company (`companyId`) | Multi-tenant isolation. Parent can see child via permission, not by default. |

---

## 12. Decisions (cost-conscious, no compromise on functionality)

**Principle:** Full functionality always. Free/low-cost defaults where they
exist. Architecture is built complete so paid providers plug in instantly
when the owner chooses to enable them — zero rework needed.

1. **Telephony provider:** Build the **full provider abstraction** with all
   three adapters (Exotel, Knowlarity, Twilio). Default to **MANUAL mode**
   (free — staff log calls manually + upload recordings). When the owner is
   ready to pay for auto-recording, they configure a provider in the UI and
   webhooks start flowing. No code changes needed — just API key entry.

2. **Recording storage:** **Local filesystem** by default (free — recordings
   stored in `/data/recordings/` with encrypted filenames). Full **S3 adapter**
   built and ready — flip a config flag to switch to S3/R2/MinIO when ready.
   No functionality difference between local and S3.

3. **AI transcription:** Build the **transcription interface** + schema fields
   (`transcriptText`, `transcriptStatus`). Default to **OFF**. When ready,
   plug in OpenAI Whisper API (or local whisper.cpp for zero cost). The UI
   for viewing transcripts is built now so it's ready when transcription is
   enabled.

4. **WhatsApp Business:** Schema supports it (`SmsLog` with `channel` field
   for SMS/WHATSAPP). Full WhatsApp tracking implemented in a later phase
   when the owner gets WhatsApp Business API access. The communication log
   UI already shows both channels.

5. **Temporary staff end-date:** **Yes** — adding `employmentEndDate` to
   `User`. Free (just a schema field). Auto-deactivation cron runs daily.
   Admins see upcoming expirations in the team dashboard.

6. **Number masking:** **Yes** — implementing it. Free (UI logic + permission
   check). Customer numbers masked (`*****3210`) for staff without
   `call.view_full_number` permission. Sales managers/owners see full numbers.

7. **Call barge/whisper:** Schema-ready (`CallLog.bargeStatus` field). Full
   implementation deferred to when a telephony provider is configured (it
   requires real-time telephony APIs). The UI placeholder is built.

8. **Conference calls:** Schema-ready (`CallLog.conferenceId` field for
   linking multiple legs). Full implementation deferred to when a provider
   with conference support is configured. 1:1 is the default now.

---

## 13. File Impact Summary

**New files (estimated):**
- `packages/services/src/telephony/provider.ts` — provider interface
- `packages/services/src/telephony/exotel.ts` — Exotel adapter
- `packages/services/src/telephony/knowlarity.ts` — Knowlarity adapter
- `packages/services/src/telephony/twilio.ts` — Twilio adapter
- `packages/services/src/telephony/recording-storage.ts` — S3 upload/download
- `packages/services/src/telephony/call-matcher.ts` — number → entity matching
- `packages/services/src/telephony/retention.ts` — recording retention cron
- `apps/web/src/app/api/auth/phone-password/route.ts`
- `apps/web/src/app/api/auth/phone-password/select/route.ts`
- `apps/web/src/app/api/users/[id]/reset-password/route.ts`
- `apps/web/src/app/api/users/[id]/unlock/route.ts`
- `apps/web/src/app/api/me/change-password/route.ts`
- `apps/web/src/app/api/telephony/webhook/route.ts`
- `apps/web/src/app/api/calls/route.ts` (+ `[id]`, notes, tags, recording)
- `apps/web/src/app/api/telephony/numbers/route.ts` (+ `[id]`, assignments)
- `apps/web/src/app/api/telephony/providers/route.ts` (+ `[id]`)
- `apps/web/src/app/api/telephony/consent/route.ts` (+ accept)
- `apps/web/src/app/api/reports/calls/route.ts` (+ export)
- `apps/web/src/app/calls/page.tsx` + `[id]/page.tsx`
- `apps/web/src/app/telephony/page.tsx` + numbers/providers/consent pages
- `apps/web/src/app/reports/calls/page.tsx`
- `apps/web/src/app/change-password/page.tsx`
- `apps/web/src/app/consent/page.tsx`
- `apps/web/src/app/m/calls/page.tsx` + new + [id]
- Various components: `CallLogTable`, `CallDetail`, `RecordingPlayer`,
  `CallNoteEditor`, `CallTagPicker`, `CompanyPhoneManager`,
  `ConsentPolicyEditor`, `CallAnalyticsCharts`

**Modified files:**
- `packages/db/prisma/schema.prisma` — new models + User/Company fields
- `apps/web/src/lib/roles.ts` — new permission keys + role mapping
- `apps/web/src/lib/nav.ts` — new nav items (Calls, Telephony, Reports)
- `apps/web/src/app/sign-in/page.tsx` — phone+password mode
- `apps/web/src/app/api/users/route.ts` — duplicate phone detection
- `apps/web/src/app/api/users/[id]/route.ts` — password reset, unlock
- `apps/web/src/components/me/me-settings-view.tsx` — security section
- `apps/web/src/app/api/me/profile/route.ts` — auth info fields
- `apps/web/src/lib/server.ts` — `CurrentUser` type additions
- `apps/web/src/middleware.ts` — consent gate (redirect to /consent if not accepted)

---

*This document is a design blueprint. No code has been changed. Review the
open questions in Section 12 before approving implementation.*
