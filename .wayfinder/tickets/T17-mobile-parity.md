# T17 — Mobile + Desktop Feature Parity (PWA Enhancement)

> Label: `wayfinder:build` · Status: **open** · Claimed by: — · Blocked by: T13 (HR/DPR — mobile-first)

## Question

The brother's design requires "Mobile + Desktop (100% feature parity). Supervisors use mobile
on-site; upper management uses desktop for analysis."

The app currently has:
- A `/field` PWA page with barcode scanning + offline mutation queue for goods receipt
- Service worker at `public/sw.js` (production only)
- Manifest at `public/manifest.webmanifest`
- shadcn UI (responsive but not mobile-optimized for field use)

But most pages are desktop-first. The field supervisor needs:
- DPR submission (from T13)
- Attendance logging (from T13)
- Material receipt confirmation (exists at `/field`)
- Stock issue recording
- Task status updates
- All of the above working offline with sync-when-online

## What needs to be built

### A. Mobile-Optimized Pages
- Bottom navigation bar for mobile (instead of sidebar)
- Touch-friendly large tap targets
- Simplified forms (fewer fields, smart defaults, camera/barcode input)
- Offline-first architecture: queue mutations locally, sync when online

### B. Field Supervisor Mobile App
- Dashboard: today's tasks, attendance pending, DPR status
- Quick actions: log attendance, submit DPR, receive materials, issue materials
- Camera integration for progress photos in DPRs
- Push notifications for task assignments and approvals

### C. Offline Sync
- Expand the existing offline queue (`@/lib/offline/queue`) to cover all field mutations
- Conflict resolution: last-write-wins for attendance, server-wins for financial transactions
- Background sync when network restored

## Resolution

_(not started — depends on T13 for DPR/attendance features)_
