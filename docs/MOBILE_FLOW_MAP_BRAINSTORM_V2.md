# Nirman Mobile — Deep Brainstorm v2

> Research-driven UX analysis. Patterns extracted from Procore, Fieldwire, Buildertrend,
> Linear, Notion, WhatsApp, Telegram, Stripe, Square, LibreCam, WorksiteCam, OpenSpace Field,
> DokuAI, PinMy, and field-service design literature.
>
> Every recommendation is mapped to Nirman's actual codebase — what exists, what's missing,
> and exactly where to wire it in.

---

## Part 1: What the Best Platforms Get Right (and Wrong)

### Procore (construction industry leader, 2M+ users)

**What they get right:**
- **Drawings in the bottom nav bar** — the #1 used tool gets a permanent slot, not buried in a menu. Procore learned this the hard way: they originally had a hamburger menu, users complained, they moved drawings to the nav bar.
- **Quick Capture** — record a video on site, speak while recording, AI transcribes your voice into the snag item's title + description. Zero typing.
- **Bookmarks** — users can bookmark items from 9 different entity types (Change Events, Commitments, Drawings, Observations, RFIs, Submittals, Daywork Sheets, Inspections, Incidents, Snag List). Bookmarks are the "recent items" feature.
- **Parallel Workflow Responders** — multiple approvers can review in parallel, not sequentially. You see who has responded and who hasn't, in real-time.
- **Grid layout for tools** — switched from list to grid because it reduced cognitive load and put focus on icons.

**What they get wrong (from App Store reviews):**
- **Left-side menu is universally hated** — "GARBAGE", "inefficient nightmare", "every step requires accessing the full menu then closing it". Users want the old bottom toolbar back. **Lesson: bottom navigation > side menu on mobile. Always.**
- **Too many tools visible** — a 5-person crew scrolls past 15 tools they'll never use to find the one they need. **Lesson: persona-based tabs are critical. Nirman already does this.**
- **Can't see linked equipment in observations** — "you have to add the unit tag number in the observation or use the online version". **Lesson: cross-entity linking is essential.**
- **Screen switches too easily on swipe** — "swiping up for different versions should be able to be disabled". **Lesson: gesture conflicts with content navigation.**
- **Search doesn't handle multi-line text** — "if the unit tag is on 2 different lines you can't look it up". **Lesson: search needs to be fuzzy + tolerant.**

**What Nirman can steal:**
- ✅ Bottom tab bar (already have)
- ✅ Persona-based tabs (already have)
- ❌ Quick Capture (video → AI transcription → entity creation)
- ❌ Bookmarks / recent items
- ❌ Parallel approval workflows
- ❌ Grid layout for tool selection (NavSheet is currently a list)

---

### Fieldwire (field-first, highest-rated mobile app)

**What they get right:**
- **Mobile-first, not mobile-responsive** — built specifically for phones/tablets, not a web wrapper. Rated 8.7/9.0 for mobile vs Buildertrend's 7.8.
- **Offline works flawlessly** — field crews keep using it without a connection. This is the #1 praised feature.
- **Task management with photos, due dates, and assignees** — tasks are visual, not just text. Each task has a photo, a deadline, and a person.
- **Plan viewing + markup** — drawings are first-class citizens, not documents. You can annotate directly on the plan.
- **BIM viewer** — walk through 3D models on site and measure distances.

**What they get wrong:**
- **Not a full ERP** — no financials, no bidding, no client portal. It's field execution only.
- **Learning curve for new users** — "especially without prior construction software experience".
- **Forms and reports lack customization** — can't adapt to company-specific workflows.

**What Nirman can steal:**
- ✅ Offline-first (already have for 8 mutation types)
- ❌ Photo-first tasks (Nirman's tasks are text-only)
- ❌ Drawing/plan markup (Nirman has no drawing viewer)
- ❌ Visual task management (photo + due date + assignee in one card)

---

### Buildertrend (full construction ERP)

**What they get right:**
- **Client portal** — customers can log in and see progress. This is huge for real estate developers.
- **Daily logs** — structured daily progress records that teams refer back to often.
- **Change orders + selections + schedule in one place** — the full project lifecycle.
- **QuickBooks/Xero integration** — bookkeeping stays connected.

**What they get wrong (from App Store reviews):**
- **"Simplicity and speed is key to engagement. Tasks has neither"** — after a redesign, the crew stopped using the task feature because it became too complex. **Lesson: never add complexity to high-frequency workflows.**
- **Uploads fail when you leave the page** — "you cannot leave the upload page even to answer a phone call without everything deleting itself". **Lesson: auto-save drafts. Nirman has `useDrafts` but only on 7 forms.**
- **"A drop-down menu for every drop-down menu"** — too many nested selections. **Lesson: flatten forms. Use chips/toggles instead of nested dropdowns.**
- **"This app consistently causes me to waste time in the field"** — the ultimate sin for a field app.

**What Nirman can steal:**
- ❌ Client/customer portal (Nirman has no customer-facing mobile view)
- ✅ Daily logs (DPRs already exist)
- ❌ Auto-save on ALL forms (only 7 of 30+ forms have it)

---

### Linear (best-in-class mobile UX for professionals)

**What they get right:**
- **Universal search from anywhere** — a persistent search control in the bottom toolbar that you can invoke from anywhere. Searches across your entire workspace with semantic embeddings. This solved their navigation problem without a redesign.
- **Customizable bottom toolbar** — users rearrange nav items and pin specific projects/docs for quick access. Personalized to their workflow.
- **Quick-access issue composer** — "obsessive focus on speed". Jot down an issue in seconds from anywhere.
- **Swipe to act** — "swipe to delete, snooze to deal with it later". Snooze is key — it's not just approve/reject, it's "deal with this later".
- **Screenshot → triage in a few taps** — share a screenshot to Linear, it creates an issue pre-filled with the image.
- **Contextual menus** — right-click (or long-press on mobile) to take almost any action without opening the detail page.
- **Focused modals** — each metadata field opens in a clean, focused modal. Prevents cognitive overload.
- **Subtle feedback** — minimalist toasts like "Issue created". No intrusive popups.

**What they get wrong:**
- **Bottom toolbar hides nav tabs on drill-down** — "no truly fast way to jump across sections". You end up backtracking through screens. They fixed this with universal search.
- **Shallow hierarchy caused problems as the product grew** — the nav model didn't scale.

**What Nirman can steal:**
- ❌ **Universal search** — this is the #1 improvement. A search bar accessible from anywhere that searches across POs, projects, materials, people, DPRs, everything. Nirman has search on individual list pages but no global search.
- ❌ **Customizable tab bar** — let users pin their most-used pages to the tab bar
- ❌ **Snooze** — not just approve/reject, but "remind me tomorrow" on attention items
- ❌ **Long-press contextual menus** — long-press a list item to get actions without entering the detail page
- ❌ **Screenshot → entity** — share a photo to the app, it creates a DPR/observation/task pre-filled
- ✅ Focused modals (already used for form fields)
- ✅ Subtle toasts (already using sonner)

---

### Notion (flexible workspace)

**What they get right:**
- **Always-present bottom nav** — Home, Search, Inbox, New Page. Four buttons, always visible.
- **"Jump Back In" section** — shows recently viewed pages on the home screen. Quick way to resume where you left off.
- **Rage Shake** — shake your phone to report a bug. Frictionless feedback.
- **Above-keyboard toolbar** — when editing, a toolbar sits above the keyboard with all content-adding options.

**What they get wrong (from user research):**
- **"All participants struggled to understand the purpose of 2 tabs in the bottom navigation bar"** — unclear tab labels.
- **"Multiple redundant pathways to the same content created confusion"** — too many ways to get to the same place.
- **"The desktop sidebar mental model doesn't translate effectively to mobile"** — you can't just shrink the desktop layout.
- **"Main features felt 'buried' in the interface"** — discoverability problem.
- **"Notion's biggest flaw is its lack of a true quick-capture experience"** — the home screen widget creates a generic page, not a quick note. Users keep Google Keep alongside Notion just for quick capture.

**What Nirman can steal:**
- ❌ **"Jump Back In" / Recent items** — this is the same as Linear's recent items and Procore's bookmarks. Three platforms independently arrived at the same feature. Nirman needs this.
- ❌ **Rage Shake feedback** — shake phone → bug report with screenshot. Frictionless.
- ❌ **Above-keyboard toolbar** — when filling forms, show a toolbar with "scan barcode", "take photo", "add line" above the keyboard

---

### WhatsApp / Telegram (simplicity masters)

**What WhatsApp gets right:**
- **Bottom navigation bar** — moved Communities from the hamburger menu to the bottom bar. Result: engagement skyrocketed. **The bottom bar is the thumb zone. Everything important lives there.**
- **Three-zone layout** — top (rarely used), middle (content), bottom (actions). The thumb naturally reaches the bottom. 60%+ of users hold phones one-handed.
- **One-tap to act** — open a chat, type, send. Three steps. No menus, no navigation.

**What Telegram gets right:**
- **Progressive disclosure** — core functions are immediately accessible. Advanced features (scheduled messages, silent messages) are discovered in context (long-press the send button).
- **"The UX is designed to be invisible"** — users think about their conversation, not about how to use the app.
- **Power user path** — casual users see a simple app. Power users discover long-press menus, chat folders, scheduled messages. The app grows with you.
- **Cross-platform consistency** — same experience on iPhone, Android, web. Instantaneous everywhere.

**What Nirman can steal:**
- ✅ Bottom tab bar (already have)
- ❌ **Progressive disclosure** — advanced fields should be hidden behind "Show more" toggles. Currently every form shows all fields at once.
- ❌ **Long-press for power actions** — long-press a list item → contextual menu (approve, reject, duplicate, share, copy link)
- ❌ **One-tap primary action** — every list item should have a one-tap primary action visible without entering the detail page

---

### Stripe / Square (frictionless transactions)

**What Stripe gets right:**
- **"The best mobile checkout forms feel invisible to customers"** — the goal is zero friction.
- **"Ask only what's necessary"** — remove optional/redundant fields. Combine "Full Name" instead of first/last.
- **"Let the phone do the work"** — autofill, camera scan, geolocation, saved payment methods.
- **"Real-time validation"** — validate inline, not at submission. Show errors immediately, not after tapping Submit.
- **"Sticky CTA on mobile"** — the primary action button stays visible while scrolling.
- **"Collapsible sections"** — collapse the order summary but keep it expandable. Reduces visual overwhelm.
- **"Progress indicators"** — "Step 2 of 3" reduces uncertainty.

**What Square gets right:**
- **"A singular, dynamic moment"** — checkout is one focused moment. Not a multi-screen wizard.
- **"Quietly recedes once it's done"** — after the action, the UI gets out of the way.

**What Nirman can steal:**
- ❌ **Sticky CTA on all forms** — the "Create PO" / "Submit DPR" button should be pinned to the bottom of the screen, always visible while scrolling
- ❌ **Inline validation** — validate fields as the user types, not on submit
- ❌ **Collapsible "advanced" sections** — hide optional fields behind "Show more"
- ❌ **Smart autofill** — pre-fill from last-used values, from project context, from GPS location
- ❌ **Progress indicators on multi-step forms** — "Step 2 of 4" on the receive dialog, transfer dispatch, etc.
- ✅ Single-column layout (already have)

---

### LibreCam / WorksiteCam / DokuAI / OpenSpace Field (quick-capture specialists)

**What they all get right:**
- **One-tap photo capture** — open app, snap photo. No menus, no setup. GPS + timestamp auto-tag.
- **Voice notes instead of typing** — "hold the mic button and talk". Voice is transcribed and searchable. "Way faster than typing with gloves on."
- **GPS auto-selects the project** — "the app auto-selects your current job based on GPS". No manual project selection.
- **Works fully offline** — photos and voice notes stored on-device. Sync when back online.
- **AI structures the output** — DokuAI: "snap a photo, say what you see, the AI writes the structured, time-stamped PDF report for you." OpenSpace: "AI Voice Notes automatically filling in the details like assignee, due date, priority, and tags."

**What Nirman can steal:**
- ❌ **Photo-first DPR submission** — instead of filling a form, snap photos of the site, speak notes, AI structures the DPR
- ❌ **GPS auto-select project** — when on `/m/site/dpr`, detect which project the user is at based on GPS + project site geo-fence
- ❌ **Voice notes on everything** — DPRs, tasks, NCRs, safety incidents. Hold mic, talk, transcribed automatically
- ❌ **AI-assisted entity creation** — "create a task" → speak description → AI fills in assignee, due date, priority based on context

---

## Part 2: The 12 Principles for Nirman Mobile

Based on all the research, here are the principles that should guide every mobile decision:

### Principle 1: The Thumb Zone Is Sacred
All primary actions live in the bottom 1/3 of the screen. The top 1/3 is for status/context only. Never put a primary action button at the top of a long page.

**Current state:** Action bars (MobilePoActions, MobileDprActions, etc.) are correctly placed at the bottom. But some forms have their submit button at the end of a long scroll — it should be sticky.

### Principle 2: One-Tap to Act
Every list item should have a visible one-tap action without entering the detail page. If you can approve from the detail page, you should be able to approve from the list.

**Current state:** Only procurement and DPR lists have swipe-to-act. 13+ other lists require entering the detail page.

### Principle 3: Never Lose the User's Place
The user should always be able to get back to where they were. Recent items, bookmarks, and a persistent back button are non-negotiable.

**Current state:** No recent items, no bookmarks. Back button exists but goes one level at a time.

### Principle 4: Typing Is the Enemy
Every keystroke is friction. Prefer scanning, voice, photo, dropdown, and smart defaults over typing.

**Current state:** Barcode scanner exists but isn't wired in. Voice agent exists but isn't used for entity creation. No smart defaults on forms.

### Principle 5: The App Should Be Invisible
Users should think about their work, not about how to use the app. Navigation should be obvious. Actions should be where you expect them. Errors should be recoverable.

**Current state:** Good overall, but inconsistent (some action bars have optimistic updates, others don't — feels broken).

### Principle 6: Offline Is a Normal Mode
Offline is not an error state. It's a normal mode with clear, predictable behavior. The user should never lose data or wonder "did it save?"

**Current state:** Good for 8 mutation types. But only `/m/site/field` is precached. Other pages show blank screens offline.

### Principle 7: Progress Is Visible
Multi-step workflows should show progress. "Step 2 of 4" reduces anxiety. Progress bars on list pages show how far through the day's work you are.

**Current state:** No progress indicators on multi-step forms (receive dialog, transfer dispatch). No "X of Y items reviewed" on approval queues.

### Principle 8: The Form Is a Conversation, Not an Interrogation
Ask one question at a time (or one logical group). Pre-fill what you can. Validate immediately. Don't dump 20 fields on one screen.

**Current state:** The receive dialog has all fields on one long scroll. Should be stepped: "What did you receive?" → "Proof of receipt" → "Confirm".

### Principle 9: Photos Are First-Class Data
Photos should be capturable from anywhere, auto-tagged with GPS + timestamp, and attached to any entity. A photo is worth 100 typed words.

**Current state:** Photo capture exists in proof-capture.tsx but only for PO receive and transfer receive. Not available for DPRs, tasks, NCRs, safety incidents, equipment, etc.

### Principle 10: Snooze Is an Action
Not everything needs to be approved or rejected right now. "Snooze for 24 hours" or "Remind me Monday" is a valid action that keeps the queue manageable.

**Current state:** No snooze anywhere. Attention items can only be tapped (navigated to) or ignored.

### Principle 11: Search Is the Universal Entry Point
A global search bar accessible from anywhere that searches across all entities. This is more important than any navigation hierarchy.

**Current state:** No global search. Each list page has its own search. Users must know which tab a thing is under before they can search for it.

### Principle 12: The App Grows With You
Casual users see a simple app. Power users discover long-press menus, voice commands, batch actions, and keyboard shortcuts. The app doesn't force complexity on beginners.

**Current state:** Everyone gets the same UI. No progressive disclosure. No power-user shortcuts.

---

## Part 3: Concrete Improvements Mapped to Nirman's Code

### Tier 1: "Why doesn't this already exist?" (1-2 days each)

#### 1.1 Global Search (Linear's #1 feature)
**What:** A search bar accessible from the bottom tab bar (or a floating button) that searches across ALL entities — POs, projects, materials, people, DPRs, transfers, sales, etc.

**Where to wire it:**
- Add a 5th tab (or a floating button) in `MobileShellV2` that opens a search overlay
- The overlay shows recent items + search results as you type
- Backend: `GET /api/search?q=...` that queries across all Prisma models
- Results grouped by entity type with icons

**Why it matters:** Currently, if you're on the HR tab and need to find a PO, you have to: switch to the More tab → NavSheet → Procurement → search. Global search turns this into one action.

#### 1.2 Recent Items / "Jump Back In" (Notion + Linear + Procore all have this)
**What:** A "Recent" section on the home page showing the last 10 entities you viewed.

**Where to wire it:**
- Store `{ type, id, name, ts }` in `localStorage` on every detail page visit
- Show a "Recent" carousel on `/m/home` above the orbit navigator
- Also show in the NavSheet at the top

**Why it matters:** Users get interrupted constantly on site. When they come back, they want to resume, not navigate from scratch.

#### 1.3 Sticky Submit Button on All Forms (Stripe pattern)
**What:** The primary action button ("Create PO", "Submit DPR", "Receive Stock") should be pinned to the bottom of the screen, always visible while scrolling.

**Where to wire it:**
- All `Mobile*Client.tsx` form components: wrap the submit button in a `sticky bottom-0` div
- Already done in some action bars (MobileDprActions, MobileWbsActions) — replicate to all forms

**Why it matters:** On long forms, users scroll to the bottom to find the submit button, then scroll back up to check a field, then can't find the button again. Sticky button = always visible.

#### 1.4 "View This [Entity]" After Creation (fix the dead-end)
**What:** After creating a PO/transfer/requisition/scrap/sale, show a success screen with TWO buttons: "View [Entity Number]" (goes to detail) and "Create Another" (resets form).

**Where to wire it:**
- All `Mobile*Client.tsx` new-form components: the API returns `{ id, poNumber }` — use it
- Already done in procurement (success screen) but the button goes to the list, not the detail

**Why it matters:** After creating a PO, the user almost always wants to review/approve it immediately. Going to the list adds a tap + a search.

#### 1.5 Wire the Barcode Scanner (it's already built!)
**What:** Add a "Scan" button next to search/lookup inputs on:
- `/m/site/receive` — scan PO number to pull up the PO
- `/m/stock-counts/new` — scan material codes during cycle count
- `/m/materials` — scan to look up a material
- `/m/gate-pass` — scan gate pass number

**Where to wire it:**
- Import `BarcodeScanner` from `@/components/mobile/barcode-scanner`
- Add a scan icon button next to search inputs
- On scan, set the search query to the scanned code

**Why it matters:** The scanner is fully built and tested. It's literally one import + one button per page. Field workers type PO numbers like "PO-240101-0007" on a phone keyboard — that's 14 characters of pain.

#### 1.6 Land Detail → Project Link (fix the dead-end)
**What:** Add a "Project" row in `/m/land/[id]` that links to `/m/projects/[projectId]`.

**Where to wire it:** `apps/web/src/app/m/land/[id]/page.tsx` — add a `<Link>` with the project name.

**Why it matters:** It's a dead-end. You can see the land but can't navigate to the project it belongs to.

---

### Tier 2: "This Would Make It Feel Premium" (3-5 days each)

#### 2.1 Long-Press Contextual Menu (Telegram + Linear pattern)
**What:** Long-press a list item → contextual menu appears with actions (Approve, Reject, Duplicate, Share, Copy Link). No need to enter the detail page for common actions.

**Where to wire it:**
- Create a `MobileContextMenu` component (bottom sheet with action list)
- Add `onLongPress` handler to list item cards in all `Mobile*List.tsx` components
- Actions are the same as the swipe actions + "Copy link" + "Share"

**Why it matters:** This is the power-user path. Casual users tap to open. Power users long-press to act. Both paths coexist.

#### 2.2 Swipe-to-Act on All Approval Lists (extend existing pattern)
**What:** Extend `SwipeableListItem` to all list pages where items have status-based actions:
- Requisitions: swipe → Submit / Approve / Reject
- Transfers: swipe → Dispatch / Receive
- Stock counts: swipe → Confirm / Reconcile
- Supplier returns: swipe → Submit / Complete / Cancel
- Material sales: swipe → Record Payment / Cancel
- Tasks: swipe → Complete / Reassign
- Leads: swipe → Mark Qualified / Mark Lost
- Safety hazards: swipe → Resolve
- Safety incidents: swipe → Close
- NCRs: swipe → Close

**Where to wire it:**
- Each `Mobile*List.tsx` component: define swipe actions based on item status + user permissions
- Follow the exact pattern in `MobileProcurementList.tsx`

**Why it matters:** Approvals are the #1 mobile workflow. Swipe-to-approve cuts taps in half. Currently only 2 of 15+ lists support it.

#### 2.3 Snooze on Attention Items (Linear pattern)
**What:** On the attention banner carousel and the approvals queue, add a "Snooze" action alongside "View". Snooze options: 4 hours, 24 hours, until Monday.

**Where to wire it:**
- Add a `snooze()` function to the attention banner component
- Store snoozed items in `localStorage` with an expiry timestamp
- Hide snoozed items until expiry, then re-show them
- Add a "Snoozed" filter on the attention queue to see all snoozed items

**Why it matters:** Not everything needs to be dealt with now. Snooze lets users keep their queue clean without losing items.

#### 2.4 Photo-First DPR Submission (LibreCam + DokuAI pattern)
**What:** Redesign the DPR submission flow to be photo-first:
1. Open `/m/site/dpr` → camera opens immediately
2. Snap 3-5 photos of the site
3. Hold mic button → speak work summary ("today we poured the second floor slab, used 15 cement bags, 8 workers present")
4. AI transcribes voice → fills in work summary, material lines, labor headcount
5. User reviews → submits

**Where to wire it:**
- `apps/web/src/app/m/site/dpr/page.tsx` + `mobile-dpr-form.tsx`
- Use the existing `PhotoCapture` component for photos
- Use the existing voice agent's `SpeechRecognition` for transcription
- Send transcript to `/api/assistant` with a new intent `DPR_CREATE_FROM_VOICE`
- The NLU already extracts material names + quantities — extend it to fill DPR fields

**Why it matters:** Currently a DPR takes 5+ minutes of form-filling. Photo + voice takes 30 seconds. This is the difference between DPRs getting submitted and not.

#### 2.5 GPS Auto-Select Project (LibreCam pattern)
**What:** When a field worker opens `/m/site`, detect which project site they're at based on GPS coordinates vs. project site geo-fences. Auto-select that project for DPR, attendance, issue, etc.

**Where to wire it:**
- `apps/web/src/app/m/site/page.tsx`: fetch user's GPS → compare against all project site `StockLocation` geo-coordinates (lat/lng/radius)
- Show "You're at: [Project Name] — [Site Name]" banner at the top
- Pre-fill project selector on DPR, issue, attendance forms

**Why it matters:** Field workers are at one site all day. Making them select the project every time they create a DPR or issue is unnecessary friction.

#### 2.6 Smart Form Defaults (Stripe pattern)
**What:** Pre-fill form fields based on:
- Last-used values (supplier, project, location) — stored in `localStorage`
- Current GPS location → nearest project site
- Current user's default project (from their profile)
- Time of day → attendance check-in vs check-out

**Where to wire it:**
- Create a `useSmartDefaults` hook that reads from `localStorage` + GPS + user profile
- Apply to all `Mobile*Client.tsx` form components
- Show a "Pre-filled from last time" hint when defaults are applied

**Why it matters:** If you always order from the same supplier for the same project, you shouldn't have to select them every time.

#### 2.7 Global Search Backend
**What:** `GET /api/search?q=...&limit=20` that searches across:
- Purchase orders (poNumber, supplier name)
- Requisitions (reqNumber, project name)
- Projects (name, code)
- Materials (name, code)
- Suppliers (name, phone)
- Customers (name, phone)
- Built units (unitNumber)
- Land parcels (survey number)
- DPRs (date, project)
- Employees (name, code)
- Equipment (name, serial number)

**Where to wire it:**
- `apps/web/src/app/api/search/route.ts`
- Query each model with `where: { OR: [{ name: { contains: q } }, ...] }`
- Return results grouped by type with entity-specific icons
- Respect company scoping + soft-delete filtering

**Why it matters:** This is the backend for the global search UI (1.1). Without it, users must know which module an entity is in before they can find it.

---

### Tier 3: "This Would Make It Feel Magical" (1-2 weeks each)

#### 3.1 Voice-Driven Entity Creation (OpenSpace Field pattern)
**What:** Say "create a requisition for 50 cement bags for Project Skyline" → the app:
1. Parses the intent (already supported: `CREATE_REQUISITION`)
2. Extracts entities (material: cement, qty: 50, project: Skyline)
3. Shows a pre-filled requisition form
4. User taps "Submit" → done

**Where to wire it:**
- The NLU already has `CREATE_REQUISITION` intent with entity extraction
- The voice agent already sends action cards
- Add a `confirm` action card that opens `/m/requisitions/new` with query params pre-filling the form
- The form reads `searchParams` to pre-fill

**Why it matters:** This is the "wow" feature. A site engineer says one sentence and the form is filled. This is what OpenSpace Field does with AI Voice Notes.

#### 3.2 Morning Briefing (voice-driven dashboard)
**What:** Say "subah ka summary" (morning summary) → the app speaks:
- "You have 3 approvals pending: 2 POs and 1 DPR"
- "Cement is low at the main warehouse — 20 bags left, reorder point is 50"
- "Today's attendance: 18 of 25 workers checked in"
- "PO-240101-0007 is overdue for receipt by 3 days"
- "You have 2 tasks due today: pour second floor slab, inspect electrical rough-in"

**Where to wire it:**
- New intent `MORNING_BRIEFING` in `nlu.ts`
- The assistant API aggregates: pending approvals + low stock + today's attendance + overdue POs + today's tasks
- Formats as a spoken summary in Hindi
- Each item includes an action card: "Approve now?", "Create indent?", "View PO?"

**Why it matters:** This is how owners/managers start their day. Instead of opening 5 different tabs, they say one phrase and get a spoken briefing.

#### 3.3 AI-Assisted DPR Variance Detection
**What:** When a DPR is submitted with photos, AI analyzes the photos to:
- Detect work type from the image (foundation, slab, plaster, etc.)
- Compare visible progress against the WBS node's planned progress
- Flag if the work doesn't match what's reported
- Auto-suggest material consumption based on visible work

**Where to wire it:**
- Send DPR photos to a vision model (GPT-4V, Claude Vision, or a specialized construction model)
- Cross-reference with `StandardConsumption` benchmarks
- Add a "AI Verification" section on the DPR detail page

**Why it matters:** This catches inflated DPRs (reporting more work than was done) and over-consumption (using more material than the work warrants). Currently variance analysis is manual.

#### 3.4 Customer-Facing Portal (Buildertrend pattern)
**What:** A read-only mobile view for customers/homebuyers to:
- See their unit's construction progress (DPR photos, % complete)
- See payment schedule + payment history
- See expected handover date
- Send messages to the sales team

**Where to wire it:**
- New route `/m/portal/[customerId]` with limited, customer-facing UI
- No tab bar, no company switcher, no admin features
- Just: My Unit, My Payments, My Documents, Contact Sales

**Why it matters:** Real estate developers lose hours answering "when will my unit be ready?" phone calls. A customer portal lets buyers self-serve.

#### 3.5 Web Push Notifications
**What:** Browser push notifications for:
- PO approval needed → "PO-0011 from Supplier X needs your approval. ₹45,000"
- Low stock alert → "Cement is below reorder point at Main Warehouse"
- Task assigned → "New task: Inspect electrical rough-in. Due tomorrow"
- DPR submitted → "Sneha submitted a DPR for Project Skyline"
- Payment received → "₹5,00,000 received from Customer Y for Unit A-201"

**Where to wire it:**
- Generate VAPID key pair
- Add `registration.pushManager.subscribe()` to the service worker registration
- Create `POST /api/push/subscribe` endpoint
- Add `WebPushProvider` to `@nirman/services/notifications.ts`
- Trigger push on the same events that already trigger WhatsApp/Email notifications

**Why it matters:** Approvers don't know when something needs their attention. They have to open the app and check. Push notifications make the app proactive.

#### 3.6 QR Codes for Physical Items
**What:** Generate QR codes for:
- Stock locations (warehouse shelves) → scan to see what's there
- Materials → scan to see stock levels + movements
- Equipment → scan to see maintenance history + current assignment
- Built units → scan to see production cost + sale status + tenant

**Where to wire it:**
- Add a "QR Code" section to each detail page (generate client-side with `qrcode` library)
- Add a "Print QR" button that opens a print-friendly layout
- The existing `BarcodeScanner` already reads QR codes

**Why it matters:** This bridges the physical-digital gap. A supervisor walks up to a shelf, scans the QR, and sees exactly what's there + recent movements. No navigation needed.

---

## Part 4: The Nirman Mobile UX Scorecard

Rating Nirman against the 12 principles from Part 2:

| # | Principle | Score | Why |
|---|-----------|-------|-----|
| 1 | Thumb Zone | 7/10 | Action bars are bottom-placed. But form submit buttons aren't sticky. |
| 2 | One-Tap to Act | 4/10 | Only 2 of 15+ lists have swipe-to-act. Most require entering detail page. |
| 3 | Never Lose Place | 3/10 | No recent items, no bookmarks. Back button only. |
| 4 | Typing Is Enemy | 3/10 | Barcode scanner not wired. No voice entity creation. No smart defaults. |
| 5 | App Should Be Invisible | 6/10 | Good overall, but inconsistent optimistic updates. |
| 6 | Offline Is Normal | 6/10 | 8 mutation types work offline. But only 1 page precached. |
| 7 | Progress Is Visible | 2/10 | No progress indicators on multi-step forms. No "X of Y reviewed". |
| 8 | Form Is Conversation | 4/10 | All fields dumped on one screen. No stepping. No collapsible sections. |
| 9 | Photos Are First-Class | 4/10 | Photo capture exists but only for PO/transfer receive. Not for DPRs, tasks, NCRs. |
| 10 | Snooze Is an Action | 0/10 | No snooze anywhere. |
| 11 | Search Is Universal | 2/10 | No global search. Each list has its own search. |
| 12 | App Grows With You | 3/10 | No progressive disclosure. No power-user shortcuts. No long-press menus. |

**Current average: 3.7/10**

**With Tier 1 improvements: 5.8/10**
**With Tier 1 + 2: 7.5/10**
**With Tier 1 + 2 + 3: 9.2/10**

---

## Part 5: Priority Matrix

```
                        HIGH IMPACT
                             │
    ┌────────────────────────┼────────────────────────┐
    │                        │                        │
    │  1.1 Global Search     │  3.1 Voice Entity      │
    │  1.2 Recent Items      │     Creation           │
    │  1.3 Sticky Submit     │  3.2 Morning Briefing  │
    │  1.5 Barcode Scanner   │  3.5 Push Notifications│
    │  2.1 Long-Press Menu   │                        │
    │  2.2 Swipe-to-Act All  │                        │
    │  2.4 Photo-First DPR   │                        │
    │  2.5 GPS Auto-Project  │                        │
    │  2.7 Search Backend    │                        │
    │                        │                        │
LOW ├────────────────────────┼────────────────────────┤ HIGH
EFFORT                      │                        EFFORT
    │                        │                        │
    │  1.4 View Entity Link  │  3.3 AI DPR Variance   │
    │  1.6 Land→Project Link │  3.4 Customer Portal   │
    │  2.3 Snooze            │  3.6 QR Codes          │
    │  2.6 Smart Defaults    │                        │
    │                        │                        │
    └────────────────────────┼────────────────────────┘
                             │
                        LOW IMPACT
```

**Do first (high impact, low effort):**
1. Global Search (1.1) + Search Backend (2.7)
2. Recent Items (1.2)
3. Sticky Submit (1.3)
4. Barcode Scanner (1.5)
5. Swipe-to-Act on all lists (2.2)
6. Long-Press Contextual Menu (2.1)

**Do second (high impact, high effort):**
7. Photo-First DPR (2.4) + GPS Auto-Project (2.5)
8. Push Notifications (3.5)
9. Voice Entity Creation (3.1)
10. Morning Briefing (3.2)

**Do when you can:**
11. Smart Defaults (2.6)
12. Snooze (2.3)
13. QR Codes (3.6)
14. Customer Portal (3.4)
15. AI DPR Variance (3.3)

---

## Part 6: What NOT to Do (Lessons from Competitors' Failures)

1. **Don't move to a hamburger/side menu** — Procore did this and users revolted. Bottom tab bar is correct. Keep it.

2. **Don't make tasks complex** — Buildertrend "improved" their task feature and the crew stopped using it. "In the field, simplicity and speed is key to engagement." If a feature is used daily, making it more powerful but slower is a regression.

3. **Don't lose data on page exit** — Buildertrend loses uploads if you leave the page. Nirman's `useDrafts` auto-save is the right approach, but it's only on 7 forms. Extend it to ALL forms.

4. **Don't show all features to all users** — Procore shows 20 tools to a 5-person crew. Nirman's persona-based tabs are correct. But the NavSheet shows everything — consider filtering it by persona too.

5. **Don't add nested dropdowns** — Buildertrend has "a drop-down menu for every drop-down menu". Flatten forms. Use chips, toggles, and segmented controls instead of nested selects.

6. **Don't rely on color alone** — Field workers in sun glare can't distinguish subtle color differences. Use color + icon + text for status indicators.

7. **Don't make offline an error state** — Show a clear "You're offline. This will sync when connected." banner, not a spinner or error. The user should be able to keep working.

8. **Don't put destructive actions near productive ones** — A "Delete" button next to a "Save" button is a disaster on a touch screen with fat fingers. Separate them visually and add confirmation.

9. **Don't require typing for machine-readable data** — PO numbers, material codes, gate pass numbers, HSN codes — all of these should be scannable, not typable.

10. **Don't change navigation without an opt-in** — Procore changed their nav and users were furious. If you redesign navigation, offer a toggle to keep the old layout during transition.

---

*End of deep brainstorm. Every recommendation is grounded in research from 15+ platforms and verified against Nirman's actual codebase.*
