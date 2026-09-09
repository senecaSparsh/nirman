# Persona Audit: Sanjeev Kumar — ADMIN of SRG REALCON

**Role:** ADMIN (Tier 1, full system access)
**Phone:** 9412230391
**Date:** 2025-01

---

## Journey Narrative

I'm Sanjeev Kumar, the system administrator for SRG REALCON. I just logged into the Nirman Inventory OS platform. As ADMIN, I have `permissions: "*"` (all permissions) and `canManageUsers: true`. My job is to manage users, settings, workflows, and integrations. Here's my step-by-step journey through the platform.

---

## Step 1: Settings — Company Configuration

### Route: `/settings`

**Files:** `apps/web/src/app/settings/page.tsx`, `apps/web/src/components/settings/settings-view.tsx`

### What I See

The Settings page has 7 tabs (visible to ADMIN since `canManageCompanies = true`):

1. **Company** — Company profile form
2. **Users** — Team member management
3. **Locations** — Stock locations
4. **Cost Centres** — Departments
5. **People** — Subcontractors & Employees
6. **Companies** — Multi-company management (ADMIN/OWNER only)
7. **Integrations** — External service connections

The **Company tab** (`settings-view.tsx:317-463`) shows a form with:

- Company Name (required)
- GSTIN, PAN
- Address
- Phone (placeholder: `+91 98765 43210`), Email
- Currency dropdown (INR, USD, EUR, GBP, AED)
- **Procurement Configuration** section:
  - LCI Threshold Default (%) — Low-Cost Item threshold
  - PO Approval — Manager Threshold (₹)
  - PO Approval — Admin Threshold (₹)
- **Approval Routing Preview** — test an amount to see which role approves a PO

Below the tabs, there's a `NotificationsPanel` (visible if `FINANCE_MANAGE` permission — ADMIN has it) and a `NotificationPreferences` panel.

### What Works

- **Company form save** (`settings-view.tsx:200-230`): PATCH `/api/companies/${company.id}` — properly wired with error handling and toast feedback.
- **GSTIN/PAN fields**: India-specific fields are present and properly labeled.
- **Currency selector**: INR is the first option — appropriate for Indian context.
- **Procurement config**: LCI threshold, PO approval thresholds, and approval routing preview are all wired and functional. The preview calls `/api/approval-routing?amount=X` and shows the required approver role.
- **Tab persistence**: Uses `useTabParam` hook to persist active tab in URL query param.
- **RBAC gate**: Server-side check at `page.tsx:36` — `hasPermission(role, PERM.COMPANY_MANAGE)`. Non-admins see `<NoAccess>`.

### What's Broken or Missing

1. **No GSTIN validation** (`settings-view.tsx:328`): The GSTIN field is a plain text input with no format validation. Indian GSTIN has a strict 15-character format (`[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}`). A typo silently saves an invalid GSTIN that will fail on GST returns.

2. **No PAN validation** (`settings-view.tsx:332`): Same issue — PAN has a strict 10-character format (`[A-Z]{5}[0-9]{4}[A-Z]{1}`). No client-side or server-side format check.

3. **Phone field has no validation** (`settings-view.tsx:342`): The phone field accepts any string. No Indian mobile number validation (10 digits, +91 prefix handling). The API does normalize via `normalizePhone()` but the UI gives no feedback on invalid input.

4. **No company logo upload**: There's no field for a company logo, which is standard for Indian business software (invoices, reports, letterheads all need it).

5. **No financial year setting**: Indian businesses operate on April–March fiscal year. There's no setting for the financial year start month, which affects reporting, payroll periods, and tax calculations.

6. **No TDS configuration**: TDS (Tax Deducted at Source) is mandatory for Indian construction companies. There's no TDS rate configuration, no TDS on contractor settings, no lower-deduction certificate support.

7. **Currency is a free dropdown but no multi-currency support visible**: While you can select USD/EUR, there's no exchange rate configuration or currency conversion logic visible in the settings.

### What's Confusing

1. **"LCI Threshold Default (%)"** (`settings-view.tsx:365-377`): The label and help text are technical. "Low-Cost Item threshold" is jargon. An admin who isn't the developer might not understand that items below this % of project budget are auto-procured without a PO. No example with actual numbers is shown.

2. **"PO Approval — Manager Threshold"** vs **"PO Approval — Admin Threshold"** (`settings-view.tsx:381-401`): The relationship between these two thresholds isn't immediately clear. The help text says "POs below this amount can be approved by a Manager" and "POs at or above this amount require the Owner" — but what about amounts between the two thresholds? The gap logic isn't explained.

---

## Step 2: Team/User Management — Create a SITE_ENGINEER

### Route: `/settings` → Users tab

**Files:** `apps/web/src/components/settings/settings-view.tsx:801-1232` (UsersManager), `apps/web/src/components/settings/create-user-dialog.tsx`

### What I See

The **Users tab** shows:

- A header with user count and action buttons: **Role Permissions**, **Custom Role**, **Bulk Import**, **Add User**
- A search bar (appears only if >10 users)
- A table with columns: Name, Email, Role, Dept, Code, Status, Actions
- Each user row has action buttons: Scope (shield), Permissions (lock), Reset Password (key), Activity Log (history), Edit Profile (pencil)
- Role is an inline dropdown (if the actor can assign roles to this user)
- Status is a clickable toggle (active/inactive)
- Below the table: a **Role Permissions** card listing all 14 roles with descriptions

Clicking **Add User** opens a **3-step wizard** (`create-user-dialog.tsx`):

**Step 1 — Profile:**

- Full Name * (placeholder: "e.g. Rajesh Kumar")
- Email, Phone (either required for login)
- Role * (dropdown of assignable roles — as ADMIN, I can assign all roles except OWNER/ADMIN/DEVELOPER at same tier)
- Employee Code (placeholder: "e.g. EMP-001")
- Designation (placeholder: "e.g. Site Engineer")
- Department (free text, placeholder: "e.g. Construction")
- Joining Date (defaults to today)

**Step 2 — Access Scope:**

- Three options: Company-wide, Departments, Projects
- If Department/Project selected, shows multi-select dropdowns
- "Reports To" selector (optional) — shows all active members with their roles

**Step 3 — Review:**

- Summary of profile, scope, and a note about module permissions
- Warning box: "Default password: nirman123"
- Create User button

### What Works

- **Hierarchical RBAC** (`roles.ts:93-109`): `canAssignRole()` properly enforces the 5-tier hierarchy. As ADMIN (tier 1), I can assign all roles at tiers 2-5, and same-tier cross-assignment with OWNER/DEVELOPER.
- **Create user API** (`api/users/route.ts:44-246`): Full validation — name required, email/phone required, role validation, hierarchical RBAC enforcement, duplicate detection (by email or phone), auto-linking to existing Employee records.
- **Scope editor** (`scope-editor-dialog.tsx`): Properly loads current scope via GET, saves via PATCH. Cycle prevention is enforced server-side via `assignScopedMembership()`.
- **Permissions editor** (`permissions-editor-dialog.tsx`): Shows role-based permissions vs per-user overrides. Additive-only model (can't revoke role permissions). Module-grouped UI with expand/collapse. Save button disabled when no changes.
- **Activity log dialog** (`user-activity-dialog.tsx`): Paginated audit trail per user with action summaries and relative timestamps.
- **Deactivation cascade** (`api/users/[id]/route.ts:169-342`): Comprehensive — revokes sessions, clears pending approvals (POs, requisitions, DPRs, expenses, invoices), cancels open tasks, removes project assignments, unassigns leads, clears reporting lines, auto-unassigns phone numbers. All audit-logged.
- **Bulk import** (`bulk-import-dialog.tsx`): CSV upload with preview, validation, template download, and per-row results. Good UX.
- **Phone-based login**: The system supports phone-only accounts (no email) by generating a placeholder `phone+XXX@nirman.internal` email. This is crucial for Indian construction sites where workers may not have email.

### What's Broken or Missing

1. **`mustChangePassword: false` hardcoded in create dialog** (`create-user-dialog.tsx:121`): The wizard sends `mustChangePassword: false`, meaning new users are NOT forced to change their password on first login. The API defaults to `true` (`api/users/route.ts:185`), but the dialog overrides it to `false`. This is a **security issue** — all new users start with the known default password `nirman123` and are never asked to change it.

2. **Default password `nirman123` is weak and hardcoded** (`api/users/route.ts:111`): The default password is `nirman123` — 10 characters, all lowercase, no special chars, no numbers. It's also displayed in plaintext in the review step (`create-user-dialog.tsx:433`). For a construction company with sensitive financial data, this is a security risk. There's no option to set a custom password during creation, and no option to send an invite link instead.

3. **Step 3 "Module Permissions" is misleading** (`create-user-dialog.tsx:421-429`): The review step has a "Module Permissions" section that says "Default permissions from the {role} role. You can customize module-level permissions after creation using the Lock button." But there's no actual permissions editor in the wizard — it's just an informational note. The heading implies you can set permissions here, but you can't. This is confusing UX.

4. **Department is free-text, not a dropdown** (`create-user-dialog.tsx:251-253`): The Department field is a plain text input, not linked to the Cost Centres/Departments managed in the Cost Centres tab. This means departments entered during user creation won't match the department records, breaking department-scoped access and reporting.

5. **No email/OTP verification on creation**: When creating a user with an email, there's no verification email sent. The user is created with `emailVerified: true` (`api/users/route.ts:179`), which is incorrect — the email hasn't been verified. This could allow creating accounts with someone else's email.

6. **Custom role permissions can't be edited from UI**: The `CreateCustomRoleDialog` (`settings-view.tsx:1334-1437`) creates a custom role with `permissions: []` (empty). The `RolePermissionsDialog` (`role-permissions-dialog.tsx`) only handles built-in roles — it uses `ROLE_LIST` which doesn't include custom roles. So after creating a custom role, there's **no way to set its permissions** from the UI. The custom role inherits its base role's permissions, but any additive permissions must be set via API directly.

7. **No password complexity settings visible**: While the API checks `company.passwordMinLength` (`api/users/route.ts:110`), there's no UI in the Company settings to configure this. The default password `nirman123` would pass an 8-char minimum but has no complexity requirements (uppercase, numbers, special chars).

8. **Role dropdown shows raw role keys for custom roles** (`settings-view.tsx:1006-1012`): When a user has a custom role, the inline role dropdown shows the custom role key (e.g., `CUSTOM_SALES_LEAD`) if the label lookup fails. The fallback logic tries `ROLE_LIST.find()` then `customRoles.find()`, but if `customRoles` prop is undefined (it's optional), custom role labels won't render.

### What's Confusing

1. **"Reports To" shows ALL active members** (`create-user-dialog.tsx:360-375`): The reports-to dropdown shows every active member regardless of hierarchy. An ADMIN could accidentally set a SITE_ENGINEER as the reporting manager of a PROJECT_DIRECTOR. The scope editor's version (`scope-editor-dialog.tsx:317-331`) correctly calls the API which returns `potentialManagers` (filtered), but the create wizard doesn't filter.

2. **Role descriptions in the table footer** (`settings-view.tsx:1092-1103`): All 14 role descriptions are listed below the user table. This is a lot of text and makes the page very long. It's not collapsible. For an admin who already knows the roles, this is noise.

3. **"Custom Role" button placement** (`settings-view.tsx:930-932`): The "Custom Role" button is in the Users tab header, but creating a custom role is a company-level action, not a per-user action. It's not obvious that this is where you'd create custom roles.

### India-Specific Gaps

1. **No Aadhaar-based verification**: Indian construction companies increasingly use Aadhaar for employee identity verification. There's no Aadhaar field or verification integration.

2. **No EPF/ESI number fields**: Employee Provident Fund (EPF) and Employee State Insurance (ESI) registration numbers are mandatory for Indian companies above certain thresholds. The employee/user profile has no fields for these.

3. **No bank account details**: There's no field for employee bank account details (account number, IFSC code), which are needed for payroll direct deposit.

---

## Step 3: Configure Permissions (Custom Roles Check)

### Route: `/settings` → Users tab → Custom Role button / Lock icon per user

**Files:** `apps/web/src/components/settings/role-permissions-dialog.tsx`, `apps/web/src/components/settings/permissions-editor-dialog.tsx`, `apps/web/src/components/settings/settings-view.tsx:1334-1437`

### What I See

**Creating a Custom Role** (via "Custom Role" button):

- A dialog with: Role Key (UPPER_SNAKE_CASE), Display Label, Description, Base Role dropdown
- Base Role options: all roles except OWNER and DEVELOPER
- The key is auto-prefixed with `CUSTOM_`
- No permissions selector in the creation dialog — permissions default to empty

**Role Permissions Dialog** (via "Role Permissions" button):

- A role selector dropdown (all 14 built-in roles)
- Module-grouped permission toggles (14 modules)
- Each module shows effective count / total count
- Additive overrides only — can't revoke role defaults
- Save / Revert buttons

**Per-User Permissions Editor** (via Lock icon per user):

- Shows the user's role and effective permissions
- Module-grouped, expandable permission list
- Each permission shows: checkbox, label, permission key code, "Role" or "Override" badge
- "Grant all" / "Remove all" per module
- Summary bar: effective permissions count, from-role count, override count

### What Works

- **Per-user permissions** (`permissions-editor-dialog.tsx`): Fully functional. GET loads current state, PATCH saves. Additive-only model is correctly enforced — role-level permissions are disabled (can't be toggled off). The UI clearly distinguishes "Role" (from role matrix) vs "Override" (per-user additive).
- **Role-level overrides** (`role-permissions-dialog.tsx`): Works for built-in roles. GET loads `RolePermission` rows, PUT saves. The diff tracking (hasChanges badge, Revert button) is good UX.
- **Permission modules** (`roles.ts:269-359`): 14 well-organized modules covering all functional areas. Each has a label, icon, and grouped permissions.
- **API validation** (`api/users/[id]/permissions/route.ts:79-84`): Validates all permissions against `ALL_PERMISSIONS` — rejects unknown permission keys.

### What's Broken or Missing

1. **Custom roles have no permissions editor** (CRITICAL): After creating a custom role via `CreateCustomRoleDialog`, there is **no UI to edit its permissions**. The `RolePermissionsDialog` only lists built-in roles from `ROLE_LIST` (`role-permissions-dialog.tsx:122-123`). Custom roles are stored in the `CustomRole` table with a `baseRole` and `permissions` array, but there's no UI to update the `permissions` array. This means custom roles are effectively just clones of their base role with no customization — defeating the purpose.

2. **Custom role tier is not editable**: The `CreateCustomRoleDialog` lets you pick a base role (which determines the tier), but there's no way to override the tier after creation. The API supports a `tier` override (`api/custom-roles/route.ts:41`), but the UI doesn't expose it.

3. **No custom role deletion UI**: There's no UI to delete a custom role. The API has `DELETE /api/custom-roles/[id]` (file exists at `api/custom-roles/[id]/route.ts`), but no button in the UI triggers it.

4. **No custom role list/edit view**: Once created, custom roles appear in the role dropdown when assigning users, but there's no dedicated view to see all custom roles, edit their labels/descriptions, or manage their permissions.

5. **Role permissions dialog doesn't show custom roles**: The `RolePermissionsDialog` role selector (`role-permissions-dialog.tsx:121-125`) iterates `ROLE_LIST` which only contains the 14 built-in roles. Custom roles are invisible to this dialog.

### What's Confusing

1. **"Custom Role" creates a role with no permissions**: The dialog says "Create a custom role with a base role (for tier and default permissions). You can fine-tune permissions after creation." (`settings-view.tsx:1382-1384`) — but there's no "fine-tune permissions" UI for custom roles. The promise is broken.

2. **Two different permission override systems**: There are per-role overrides (`RolePermission` table, via Role Permissions dialog) AND per-user overrides (`UserPermission` table, via per-user Lock icon). It's not clear which to use when. The role-level override affects ALL users with that role; the per-user override affects one user. This distinction isn't explained anywhere in the UI.

---

## Step 4: Workflow Builder Review

### Route: `/workflows` (list), `/workflows/new` (builder), `/workflows/[id]` (editor)

**Files:** `apps/web/src/app/workflows/page.tsx`, `apps/web/src/components/workflows/workflows-list.tsx`, `apps/web/src/components/workflows/workflow-builder.tsx`, `apps/web/src/app/workflows/new/page.tsx`, `apps/web/src/app/workflows/[id]/page.tsx`

### What I See

**Workflows List** (`/workflows`):

- DataTable with columns: Workflow (name + description), Status, Schedule, Runs, Next Run, Created, Actions
- Actions: Run Now (play), Delete (trash) — only if `canManageWorkflows()`
- Empty state with "Create Workflow" button
- Row click navigates to editor

**Workflow Builder** (`/workflows/new`):

- Toolbar: name input, status pill, Add Step button, Templates button, Schedule button, Save/Create button, Run Now (if editing)
- Description input
- **ReactFlow canvas** with dot grid background, controls, minimap
- Step editor sidebar (when a step is selected)
- Run history (when editing existing workflow)

**Step Types** (7 available):

1. Create Task — assign a task to a user (title, assignee, priority, instructions)
2. Send Notification — notify a user in-app (recipient, title, message)
3. Create Record — create a DB record (task, project cost, expense)
4. Wait — pause for a duration (minutes)
5. Condition — branch based on predicate (low stock, overdue POs, pending approvals, task count, custom field)
6. Update Status — update a record's status (entity type, entity ID, new status)
7. Auto Indent — generate a draft requisition for low-stock materials

**Templates** (7 available):

- Weekly Site Inspection, Low Stock Reorder, Monthly Financial Review, Project Status Update, Equipment Maintenance Reminder, Overdue PO Chase-up, Blank Workflow

**Schedule Dialog**:

- Interval (minutes) or Cron expression
- Enable/disable toggle
- Next run display

### What Works

- **Canvas interaction**: ReactFlow with drag-and-drop nodes, connectable edges, minimap. Nodes are color-coded by step type. Start step is marked with a badge.
- **Step editor sidebar**: Each step type has a custom config form. Create Task fetches users from `/api/users`. Auto Indent fetches projects from `/api/projects`.
- **Templates**: Pre-built workflow graphs that load into the canvas with a click. Good starting points.
- **Save/Create**: POST to `/api/workflows` (create) or PATCH `/api/workflows/[id]` (update). Redirects to editor after creation.
- **Run Now**: POST to `/api/workflows/[id]/runs`. Shows toast with run status.
- **Schedule**: POST to `/api/workflows/[id]/schedule`. Sets interval or cron, enables/disables.
- **Delete**: DeleteConfirmDialog with proper confirmation.
- **Run history**: Shows recent 10 runs with status, step, trigger, error, completion time.
- **RBAC**: List page checks `CANVAS_VIEW`. Builder checks `canManageWorkflows()` for edit controls. Read-only mode shows a banner when user can't edit.

### What's Broken or Missing

1. **Permission gate is too permissive on the New Workflow page** (`workflows/new/page.tsx:28`): The page only checks `PERM.CANVAS_VIEW`, not `PERM.CANVAS_EDIT` or `PERM.CANVAS_CREATE`. A user with only `CANVAS_VIEW` (e.g., SUPERVISOR) can access the builder page. The builder correctly disables edit controls via `canManageWorkflows()`, but the page itself renders the full builder UI. The list page (`workflows/page.tsx:30`) also only checks `CANVAS_VIEW`.

2. **Update Status step requires manual Entity ID** (`workflow-builder.tsx:776-779`): The "Update Status" step requires typing a raw entity ID. There's no entity picker — you have to know the UUID. This makes the step practically unusable for non-technical users.

3. **Condition step edges don't show labels in the canvas**: When loading a template with conditional edges (e.g., Low Stock Reorder), the edges have `condition: "true"` / `condition: "false"` in the data, but the `buildGraph()` function (`workflow-builder.tsx:242-255`) only passes the condition if `e.data?.condition` exists. When creating new edges via drag, there's no UI to set the condition label. The condition step's help text says "Connect the true edge to the step that runs when the condition is met" but there's no way to label which edge is true vs false.

4. **No workflow validation before save**: The save function (`workflow-builder.tsx:257-295`) only checks for a name and at least one step. It doesn't validate that:
   - The start step has outgoing edges
   - All steps are reachable from the start
   - Condition steps have both true and false edges
   - Required config fields are filled (e.g., Create Task has an assignee)
     This means you can save a broken workflow that will fail on execution.

5. **No workflow duplication/clone**: There's no way to duplicate an existing workflow. You'd have to recreate it from scratch or use a template.

6. **No workflow export/import**: Workflows can't be exported as JSON or imported from another company.

7. **Schedule dialog doesn't validate cron**: The cron expression input (`workflow-builder.tsx:529-537`) accepts any string. There's no client-side validation that it's a valid cron expression. An invalid cron would fail silently or error at runtime.

8. **Step palette is a dropdown, not a drag-and-drop panel**: The "Add Step" button opens a dropdown menu (`workflow-builder.tsx:372-397`). You can't drag steps from a palette onto the canvas, which is the standard ReactFlow UX pattern. New steps appear at a semi-random position.

9. **No step search/filter**: With 7 step types this is fine, but if more are added, the dropdown will need search.

### What's Confusing

1. **"Auto Indent" terminology** (`workflow-builder.tsx:48`): The step is labeled "Auto Indent" but the description says "Generate a draft indent for low-stock materials." In Indian construction, "indent" is commonly used for material requisitions, but the rest of the app uses "requisition" and "MaterialRequisition". The terminology is inconsistent.

2. **Cron expression help** (`workflow-builder.tsx:535-537`): The help text says "Standard cron format: minute hour day month weekday" but doesn't explain the 5-field format or give examples beyond the placeholder. Most Indian construction admins won't know cron syntax.

3. **Schedule "interval" vs "cron"**: Both fields are shown simultaneously. If you fill both, the behavior is undefined — the API might use one or the other. There's no mutual exclusion or explanation of which takes precedence.

### India-Specific Gaps

1. **No festival/holiday-aware scheduling**: Indian workflows often need to skip national holidays (Republic Day, Independence Day, Gandhi Jayanti) and regional festivals. The cron-based scheduler doesn't account for holidays.

2. **No SMS/WhatsApp notification step**: The only notification step is in-app. Indian construction sites rely heavily on WhatsApp for communication. There's no workflow step to send a WhatsApp message or SMS.

---

## Step 5: Audit Log Review

### Route: `/finance/audit`

**Files:** `apps/web/src/app/finance/audit/page.tsx`, `apps/web/src/app/finance/audit/audit-view.tsx`, `apps/web/src/app/api/audit/route.ts`

### What I See

The Audit Trail page shows:

- **Filters card**: Entity Type (dropdown of 22 entity types), Action (dropdown of 22 action types), User (dropdown of company members), Start Date, End Date, Apply Filters button
- **Audit log table**: Time (date + relative), Action (color-coded mono text), Entity (link to entity page), User, Changes (before/after diff)
- DataTable with search, pagination (25 per page), and export

### What Works

- **RBAC**: Server-side check at `page.tsx:28-31` — only OWNER/ADMIN can access. API also checks `PERM.AUDIT_VIEW` and enforces `isSuperuser` for the `all=true` parameter.
- **Company scoping**: API filters by `companyId` (`api/audit/route.ts:55-60`) to prevent cross-company data leaks. Legacy entries with null companyId are visible to OWNER/ADMIN.
- **Filters**: Entity type, action, user, date range all work. The date range correctly includes the full end day (23:59:59.999).
- **Before/after diff** (`audit-view.tsx:249-293`): Shows created/deleted/changed fields with color coding (green for new, strikethrough red for old). Truncates long values and shows "+N more".
- **Entity links**: The Entity column links to the entity's page via `entityUrl()` — clicking takes you to the actual record.
- **Pagination**: Cursor-based pagination with `hasMore` and `nextCursor` in the API. The UI uses DataTable's built-in pagination.
- **Export**: DataTable supports export with `exportFileName="audit-trail"`.

### What's Broken or Missing

1. **No real-time updates**: The audit log is static — you have to click "Apply Filters" to refresh. There's no auto-refresh or WebSocket/SSE for live audit streaming. For a security-critical feature, real-time would be valuable.

2. **No "Load More" / infinite scroll**: The API supports cursor-based pagination (`hasMore`, `nextCursor`), but the client `AuditTrailView` doesn't use it. It fetches all entries at once (up to the API limit of 100/500) and relies on DataTable's client-side pagination. For companies with thousands of audit entries, this won't scale.

3. **Entity type list is hardcoded** (`audit-view.tsx:26-32`): The 22 entity types are hardcoded in the component. If a new entity type is added to the system, it won't appear in the filter dropdown until the code is updated. The API doesn't provide a dynamic list of entity types.

4. **Action type list is hardcoded** (`audit-view.tsx:34-41`): Same issue — 22 action types are hardcoded. New actions (e.g., `CUSTOM_ROLE_CREATED`, `USER_DEACTIVATION_CLEANUP`, `PHONE_AUTO_UNASSIGN_ON_DEACTIVATION` which are logged by the API) don't appear in the filter dropdown.

5. **No audit log for settings changes**: While company profile updates are likely logged, the audit view's entity type list doesn't include "Company" or "Settings" or "CustomRole" or "TelephonyProviderConfig". Changes to company configuration may not be visible in the audit trail.

6. **No CSV/export with all fields**: The DataTable export includes the visible columns, but the "Changes" column export is a JSON stringification (`audit-view.tsx:141-146`). This isn't human-readable in a spreadsheet.

7. **Error handling is silent** (`audit-view.tsx:67`): If the API call fails, `setEntries([])` is called with no error message shown to the user. The table just shows "No audit entries" instead of an error.

### What's Confusing

1. **Entity types show raw model names**: The filter shows "PurchaseOrder", "MaterialRequisition", "GoodsReceipt" etc. — these are Prisma model names, not user-friendly labels. An admin might not know that "MaterialRequisition" = "Indent" or "GoodsReceipt" = "GRN".

2. **Action types show raw enum values**: "CREATE", "UPDATE", "DELETE" are clear, but "RESUBMIT", "RECONCILE", "WAIVE_QUOTES", "SELECT_QUOTE" are domain-specific and might not be immediately understood.

3. **Audit trail is under "Books" world, not "Settings"**: The audit trail is at `/finance/audit` and appears in the "Books" (finance) world in the navigation (`nav.ts:855-861`). But it's a system-wide audit, not just finance. An admin looking in Settings for the audit log won't find it there.

---

## Step 6: Telephony Configuration

### Route: `/telephony` → redirects to `/calls?tab=telephony`

**Files:** `apps/web/src/app/telephony/page.tsx`, `apps/web/src/app/calls/page.tsx`, `apps/web/src/components/calls/telephony-view.tsx`, `apps/web/src/app/m/telephony/page.tsx`, `apps/web/src/app/m/telephony/MobileTelephonyView.tsx`

### What I See

The `/telephony` route immediately redirects to `/calls?tab=telephony` (`telephony/page.tsx:6`). On the Calls page, there's a tab switcher between "Call Log" and "Telephony" (if the user has `TELEPHONY_VIEW` permission).

The **Telephony tab** (desktop, `telephony-view.tsx`) shows:

- Phone numbers management (add, assign, unassign, delete)
- Provider configuration (webhook URLs)
- Consent policy management
- Recording configuration (mode: ALL/SELECTED/NONE, per-user selection)
- Twilio integration tab

The **Mobile telephony** (`/m/telephony`) has 5 tabs:

1. Numbers — phone number cards with assign/unassign
2. Providers — provider config cards
3. Consent — consent policy
4. Recording — recording mode + per-user toggle
5. Twilio — Twilio-specific config

### What Works

- **Phone number management**: Add, assign to team members, unassign, delete. All via `/api/telephony/numbers/[id]` PATCH/DELETE.
- **Recording configuration**: Three modes (ALL, SELECTED, NONE) with per-user selection in SELECTED mode. Saves via `/api/telephony/recording-config` PATCH.
- **Consent policy**: Display current policy with version, effective date, acceptance count.
- **Twilio integration**: Dedicated tab for Twilio config (sync numbers, sync calls, configure webhook, status check).
- **RBAC**: `TELEPHONY_VIEW` for viewing, `TELEPHONY_MANAGE` for editing. ADMIN has both.
- **Company config fields**: Recording consent beep, retention days, auto-delete, storage provider, recording mode — all passed from company settings.
- **Security fields**: `passwordMinLength`, `accountLockoutThreshold`, `accountLockoutDurationMin` are passed to the desktop telephony view (from company settings), suggesting some security config is available here.

### What's Broken or Missing

1. **`/telephony` is a dead redirect** (`telephony/page.tsx:1-7`): The entire `/telephony` route is a 7-line file that just redirects to `/calls?tab=telephony`. This is fine functionally, but the nav link (`nav.ts:960-966`) points to `/calls?tab=telephony` directly, so the `/telephony` route is never actually used. It's dead code.

2. **No "Add Number" button visible in mobile Numbers tab** (`MobileTelephonyView.tsx:245-252`): The mobile Numbers tab shows "No company numbers" empty state with hint "Add a phone number to start tracking calls." but there's no Add button. The empty state doesn't have an action button. An admin on mobile can't add a new number from this view.

3. **Providers tab is read-only on mobile** (`MobileTelephonyView.tsx:404-444`): The mobile Providers tab only displays existing providers. There's no "Add Provider" button. The `canManage` prop is passed but not used for any add/edit functionality.

4. **Consent tab is display-only on mobile** (`MobileTelephonyView.tsx:160`): The ConsentTab receives `policy` and `company` but the mobile view doesn't show any edit/create functionality for the consent policy.

5. **No Indian telephony provider integration**: The telephony system supports Twilio (US-based) and generic webhook providers. There's no built-in integration with Indian telephony providers like Exotel, Knowlarity, Jio, or Ozonetel, which are the standard for Indian businesses. The nav hint (`nav.ts:965`) mentions "exotel, knowlarity" as keywords but there's no actual integration code for them.

6. **No IVR/menu configuration**: There's no UI to configure IVR (Interactive Voice Response) menus, which are standard for Indian business phone systems.

7. **No call recording download from telephony settings**: While recordings can be listened to from the Call Log, there's no way to download or manage recordings from the telephony settings page.

8. **No bulk number import**: Phone numbers must be added one at a time. For a company with many numbers, there's no CSV import.

9. **`window.location.reload()` after assign/unassign/delete** (`MobileTelephonyView.tsx:187, 211, 235`): The mobile telephony view uses `window.location.reload()` instead of `router.refresh()` after actions. This causes a full page reload, losing the active tab state and scrolling position. The desktop version likely uses `router.refresh()`.

### What's Confusing

1. **Telephony is buried inside Calls**: The telephony configuration is a tab inside the Calls page, not a standalone settings page. An admin looking in Settings for telephony config won't find it — they need to go to Calls → Telephony tab. The nav link does point to `/calls?tab=telephony`, but the mental model is confusing.

2. **Two different telephony UIs**: The desktop telephony view (`telephony-view.tsx`) and mobile telephony view (`MobileTelephonyView.tsx`) are completely different components with different features. The desktop version has more fields (monthlyCost, acquiredAt, consentBeep per number, security settings). The mobile version is simpler. This isn't necessarily wrong, but the feature disparity could confuse users who switch devices.

3. **Security settings in telephony**: The desktop telephony view receives `passwordMinLength`, `accountLockoutThreshold`, `accountLockoutDurationMin` (`calls/page.tsx:149-152`). These are account security settings, not telephony settings. Their presence in the telephony view is confusing — they should be in a dedicated Security settings section.

### India-Specific Gaps

1. **No TRAI compliance features**: Indian telephony regulations (TRAI) have specific requirements for call recording consent, DND (Do Not Disturb) compliance, and promotional message restrictions. The consent policy feature partially addresses recording consent, but there's no DND check before outbound calls.

2. **No Indian number format validation**: Phone numbers aren't validated against Indian formats (10-digit mobile, landline with STD code). The `normalizePhone()` function handles formatting but the UI doesn't validate or give feedback.

3. **No SMS gateway integration**: Indian businesses use SMS gateways (MSG91, TextLocal, Gupshup) for transactional SMS. There's no SMS gateway configuration in the telephony or integrations settings.

4. **No WhatsApp Business API integration**: WhatsApp is the primary communication channel for Indian construction businesses. There's no WhatsApp Business API integration in the telephony or integrations settings.

---

## Step 7: Integrations Tab

### Route: `/settings` → Integrations tab

**Files:** `apps/web/src/components/settings/integrations-tab.tsx`

### What I See

The Integrations tab shows a list of integration cards. Each card has:

- Icon, label, description
- Status badges: Enabled/Disabled/Not configured, Verified, Error
- Configure/Hide button
- When expanded: enable toggle, config fields, Save, Test Connection, Remove buttons

### What Works

- **Dynamic field rendering** (`integrations-tab.tsx:281-325`): Fields are rendered based on type (text, password, url, number, boolean). Password fields are masked. Boolean fields show toggles.
- **Save/Verify/Remove**: POST to save, POST to verify, DELETE to remove. All with loading states and toast feedback.
- **Masked credentials**: Existing password values show as `••••••••` with "unchanged" placeholder.
- **Enable/disable toggle**: Per-integration enable/disable.
- **Error display**: Last verify error is shown in red mono text.

### What's Broken or Missing

1. **Integrations list is loaded from API**: The available integrations come from `/api/integrations` GET. Without seeing the API, I can't verify what integrations are available. But based on the icons (Calculator, MessageCircle, Mail, Building2), it seems like there are 4 integrations: Tally (accounting), WhatsApp, Email, and something else.

2. **No GST/e-invoice integration**: Indian businesses need GST return filing and e-invoice generation. There's no integration with GST portals or e-invoice APIs (ClearTax, Zoho Books, Tally).

3. **No bank integration**: There's no bank account integration for auto-reconciliation of payments (e.g., ICICI, HDFC, SBI APIs or Razorpay/Xpertledger).

4. **No WhatsApp Business API**: While there's a MessageCircle icon (likely WhatsApp), it's unclear if this is a full WhatsApp Business API integration or just a webhook.

---

## Summary of Issues

### Broken (Critical)

1. **`mustChangePassword: false` in create user wizard** — New users aren't forced to change the default password `nirman123` on first login (`create-user-dialog.tsx:121`). Security risk.
2. **Custom roles have no permissions editor** — After creating a custom role, there's no UI to set its permissions. The "fine-tune permissions after creation" promise is broken (`settings-view.tsx:1382-1384`).
3. **No custom role management UI** — Can't delete, edit, or view custom roles after creation. No dedicated custom roles list.
4. **Workflow condition edges can't be labeled** — No UI to mark which edge is "true" vs "false" for condition steps. Templates work (pre-labeled), but user-created condition steps are ambiguous.
5. **Audit entity/action types are hardcoded** — New audit actions (like `CUSTOM_ROLE_CREATED`, `USER_DEACTIVATION_CLEANUP`) don't appear in the filter dropdown (`audit-view.tsx:26-41`).
6. **Mobile telephony has no "Add Number" button** — Admins on mobile can't add new phone numbers (`MobileTelephonyView.tsx:245-252`).
7. **Audit view silently swallows errors** — API failures show "No audit entries" instead of an error message (`audit-view.tsx:67`).

### Missing

1. **GSTIN/PAN format validation** — No client-side or server-side validation for Indian tax IDs.
2. **No financial year configuration** — Indian April–March fiscal year not configurable.
3. **No TDS configuration** — Tax Deducted at Source settings missing.
4. **No company logo upload** — Needed for invoices, reports, letterheads.
5. **No password complexity settings UI** — `passwordMinLength` exists in DB but no UI to configure it.
6. **No workflow validation** — Broken workflows (unreachable steps, missing config) can be saved.
7. **No workflow duplication** — Can't clone an existing workflow.
8. **No real-time audit log** — Static, requires manual refresh.
9. **No audit log cursor pagination in UI** — API supports it, UI doesn't use it.
10. **No Indian telephony provider integrations** — Exotel, Knowlarity, Ozonetel not integrated despite being mentioned in nav keywords.
11. **No SMS gateway integration** — MSG91, TextLocal, Gupshup not available.
12. **No WhatsApp Business API integration** — Critical for Indian construction communication.
13. **No GST/e-invoice integration** — No ClearTax, Tally, or GST portal integration.
14. **No EPF/ESI/bank account fields** — Missing from employee/user profiles.
15. **No Aadhaar verification** — Missing identity verification for Indian workforce.
16. **No IVR configuration** — Standard for Indian business phone systems.
17. **No DND compliance** — TRAI Do Not Distill registry check missing.
18. **No custom role deletion UI** — API exists, no button in UI.
19. **Department field in create user is free-text** — Not linked to Cost Centres/Departments.
20. **No email verification on user creation** — `emailVerified: true` is set without actually verifying.

### Confusing

1. **Step 3 of create wizard shows "Module Permissions" heading** but is just an informational note — no actual permissions editor (`create-user-dialog.tsx:421-429`).
2. **Two permission override systems** (role-level vs per-user) with no explanation of when to use which.
3. **"Reports To" in create wizard shows all members** — no hierarchy filtering, could create invalid reporting lines.
4. **Role descriptions listed below user table** — 14 descriptions, not collapsible, adds page length.
5. **"Custom Role" button in Users tab** — Company-level action in a user-level context.
6. **Audit trail under "Books" world** — System-wide audit hidden in finance navigation.
7. **Entity/action types show raw model names** — "MaterialRequisition" instead of "Indent", "GoodsReceipt" instead of "GRN".
8. **Telephony buried inside Calls** — Not in Settings where admins expect it.
9. **Security settings in telephony view** — `passwordMinLength`, `accountLockoutThreshold` mixed with telephony config.
10. **"Auto Indent" vs "Requisition"** — Inconsistent terminology in workflow builder.
11. **Cron expression help is minimal** — No examples, no explanation of 5-field format.
12. **Schedule interval vs cron** — Both shown simultaneously, no mutual exclusion or precedence explanation.
13. **LCI threshold jargon** — Technical term without clear explanation for non-technical admins.
14. **PO approval threshold gap** — Logic for amounts between Manager and Admin thresholds not explained.

### India-Specific Gaps

1. **No GSTIN/PAN validation** — Critical for tax compliance.
2. **No TDS configuration** — Mandatory for construction companies.
3. **No financial year (April–March) setting** — Affects all reporting and payroll.
4. **No Indian telephony providers** — Exotel, Knowlarity, Ozonetel, Jio missing.
5. **No SMS gateway** — MSG91, TextLocal, Gupshup for transactional SMS.
6. **No WhatsApp Business API** — Primary communication channel for Indian construction.
7. **No GST/e-invoice integration** — ClearTax, Tally, GST portal APIs.
8. **No EPF/ESI fields** — Mandatory for companies above thresholds.
9. **No Aadhaar verification** — Increasingly required for workforce identity.
10. **No bank account/IFSC fields** — Needed for payroll direct deposit.
11. **No festival/holiday-aware scheduling** — Indian holidays affect workflow schedules.
12. **No DND compliance** — TRAI regulations for outbound calls.
13. **No Indian number format validation** — 10-digit mobile, STD code landlines.
14. **No IVR configuration** — Standard for Indian business phone systems.
15. **No regional language support** — Hindi, regional language UI for field workers.
16. **No cash purchase/petty cash tracking** — Common in Indian construction sites.
