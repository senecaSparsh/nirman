# T09 — Task management works end-to-end

> Label: `wayfinder:grilling` · Status: **open** · Blocked by: T01

## Question

Does the task execution engine work end-to-end — create task with initial subtasks + estimate →
toggle subtasks (progress % live-updates) → add dependency (blocked task can't go IN_PROGRESS) →
start/stop timer (effort vs estimate) → add/delete comments → reassign → status transitions —
with `TaskActivity` feed and `AuditLog` entries appended immutably inside each transaction, and
the TaskDetailDrawer tabs (Steps/Discussion/Activity/Links/Time) all functional on both `/tasks`
and `/my-tasks`?

## Checklist

- [ ] `/tasks`: create a task with 3 subtasks + a 4h estimate via AssignTaskDialog
- [ ] Open TaskDetailDrawer; toggle subtasks; verify progress % = completed/total
- [ ] Add a dependency on another task; verify blocked task rejects IN_PROGRESS transition
- [ ] Start timer; wait; stop; verify `TaskTimeLog` duration + `totalLoggedMinutes` updates
- [ ] Add a comment; delete it; verify `TaskActivity` records both
- [ ] Reassign task; verify assignee change + activity entry
- [ ] Move task through TODO → IN_PROGRESS → DONE; verify invalid transitions rejected
- [ ] `/my-tasks`: verify only tasks assigned to current user appear
- [ ] Verify `TaskActivity` feed matches the actions taken (never diverges)
- [ ] Log every defect; fix in priority order

## Resolution

_(filled on close)_
