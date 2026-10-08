# Nirman — Product Thesis

## Who we win and why we're hard to beat

> Internal strategy. The honest version of "what makes us unstoppable" —
> grounded in what was actually verified on the platform, not aspiration.

---

## The real user is not the admin

The person who decides whether this lives or dies is a **site supervisor /
mason / storekeeper / gate guard** on a ₹6,000–10,000 Android:

- cracked screen, gloves on, standing in dust and sunlight
- thinks in **Hindi/regional + WhatsApp**, not English enterprise software
- will not be trained — if it takes a manual, it loses
- does things **out of order, backdated, partial, verbal** — and expects the
  app to take it anyway
- their current system is a notebook + a phone camera + memory + a daily
  phone call. **That is our competitor, not another ERP.**

The office person (owner, PM, finance) is the _buyer and reviewer_. The field
worker is the _data source_. The whole company's value — accurate stock,
verified attendance, real receipts — only exists if the field worker actually
records it. So the product lives or dies on the 30 seconds a tired worker
spends logging a receipt.

## The uncomfortable truth we found

The platform is **architecturally production-grade.** The field surface is a
deliberate **dense, data-first** design — compact type scale, tight tap
targets — and that's kept on purpose. The adoption gap isn't the visual
scale; it's the **entry path** for a non-English, non-technical worker:

- The UI is **English-only.** The one input a non-English worker has — the
  bilingual voice agent (hi-IN) — is a small header mic, not the front door.
- The _correct instincts exist_ (photo-required GRN, GPS attendance,
  bilingual voice NLU, offline queue, direct/cash purchase) — but they're
  organized like enterprise software, not like the worker's day.

## What "unstoppable" means in this market

A moat isn't a feature list — it's that **a rigid, non-tech worker uses it
without being asked twice.** Three concrete bends:

### 1. Voice + photo are the front door, not features

A worker's primary input should be **speaking Hindi or snapping a photo** —
the two things they already do on WhatsApp. Forms become _confirmations_,
not entry points. Success metric: a worker can log a receipt, check in, and
file a DPR **without reading a word of English.**

### 2. Bend, don't enforce

The market runs on cash, verbal deals, backdated entries, partial payments,
out-of-order steps. The app must **accept the messy real thing and reconcile
to the ledger** — never block until the ideal workflow is followed.
`direct-purchases` already models this (cash buy, no PO needed); it should be
the default posture everywhere, not the exception.

### 3. Readable, forgiving, tolerant

Bigger text, 44px+ targets, minimal typing, undo everywhere, works offline
and syncs silently. A worker who can't afford a wrong tap or a lost record.

## The strategic read

We've built the **system of record** correctly — double-entry GL, immutable
audit, tier-gated permissions, offline queue. That part is genuinely hard and
it's done. The gap is the **front door**: the same depth doesn't exist where
the field worker actually touches it. Closing that gap — vernacular voice,
photo-first entry, informal-process tolerance — is what turns "impressive
system" into "a mason uses it daily."

## Prioritized moves

| #   | Move                                       | Why it matters              | Status |
| --- | ------------------------------------------ | --------------------------- | ------ |
| 1   | Voice agent → primary home surface (hi-IN) | unlocks non-English users   | next   |
| 2   | Photo-first entry for field records        | matches existing behavior   | next   |
| 3   | Audit flows for informal-process bends     | bend vs enforce             | next   |
| 4   | Vernacular UI labels (hi-IN toggle)        | reading surface for workers | design |
| 5   | WhatsApp-shareable receipts/reports        | meet them where they are    | design |

> **Deliberate design, kept:** the compact mobile type scale (dense, data-first).

## What we're NOT competing on

Not "more features" — a rigid market doesn't want more. We win on
**adoption**: the only ERP a field worker will actually use, in their
language, on their cheap phone, that takes their messy real-world input.
The ledger underneath stays rigorous; the surface stays forgiving.
