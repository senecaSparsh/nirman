# Differential Security Review — users/[id]/verify-phone

**Scope**: commits 57d6efe2 (SMS provider wiring) + fd214055 (OTP attempt-limit) + follow-up hardening
**Risk**: HIGH (auth/OTP surface) · Size: 1 file → DEEP review
**Reviewer**: tob-differential-review skill

## Findings

### F1 — Cross-tenant user targeting (FIXED)

- `POST`/`GET` loaded the target user by bare `id` — no `UserCompany` membership
  check. Every sibling route (`users/[id]`, `scope`, `reset-password`, `unlock`)
  performs this check; this route did not.
- **Attack**: an actor with `USERS_MANAGE` in company A + knowledge of a userId
  in company B could (a) trigger OTP SMS sends to the victim's phone (3/10min),
  (b) mark that user's `phoneVerified`/`phoneSyncedAt` if the code was known,
  (c) via GET, read another company's user's phone + verification status.
- **Severity**: LOW-MEDIUM — gated behind USERS_MANAGE/USERS_VIEW, OTP still
  required for verify, but it is a cross-tenant write+read surface.
- **Fix**: mirror the sibling pattern — `UserCompany(userId, companyId)`
  membership OR `target.companyId === company.id`, else 404. Applied to both
  POST and GET.

### F2 — TOCTOU on OTP attempt counter (FIXED)

- Wrong-code path did `findFirst` → check `attempts < MAX` → `update increment`.
  Concurrent wrong guesses could both pass the check → bounded extra attempts.
- **Fix**: conditional `updateMany({ id, attempts: { lt: MAX } })` — atomic
  check+increment; `count === 0` → 429 (exhausted concurrently).

## Verified correct (no action)

- OTP lookup by latest-unused-phone (portal's model) + `orderBy createdAt desc`
- Prior codes invalidated on new send (`updateMany usedAt`)
- `devCode` only in non-production; prod returns honest 501 on SMS failure
- Send rate-limit (3/10min) + 5-attempt lock + 6-digit regex + TTL
- Auth: `USERS_VIEW` + self-or-`USERS_MANAGE` + `canManageRole` tier check
- `phoneOtp.code !== code` compare before mark-used; used marked before verify flag

## Residual (accepted, documented)

- Response strings differ between "no active OTP" vs "wrong code" — reveals an
  OTP exists for the phone. Permission-gated; low value to attacker.
- `remaining` count disclosed in error message (portal does the same).
- Send path create→invalidate ordering could interleave two concurrent sends;
  at worst two valid codes briefly — bounded by 3/10min rate limit.
- Cross-tenant e2e test not added: dev DB seeds a single company; check verified
  by code review + sibling-pattern parity. Flagged for future multi-company fixture.

## Coverage limits

- Single-file diff reviewed DEEP. Provider layer (`otp-sms.ts`) reviewed earlier
  this session (MSG91/Twilio abstraction, no secret logging).
- Confidence: HIGH on the two findings; MEDIUM on "no other callers affected"
  (callers = admin verify-phone UI only).
