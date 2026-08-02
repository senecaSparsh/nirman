# T12 — Workflows & workspaces work end-to-end

> Label: `wayfinder:grilling` · Status: **open** · Blocked by: T01

## Question

Do the workflow + custom workspace systems work end-to-end — create a workflow with a node graph,
schedule it (cron), trigger a run (manual + via `/api/workflow-scheduler` external cron), view run
history, and build/save a custom workspace on `/playground` with a drill-down query — so the
"system" nav section is verified, not just present?

## Checklist

- [ ] `/workflows/new`: create a workflow with a simple node graph
- [ ] `/workflows/[id]`: edit the graph; save; verify persistence
- [ ] Schedule the workflow (cron expression); verify `ScheduledWorkflow` record
- [ ] Trigger a manual run; verify `WorkflowRun` record + status transitions
- [ ] Hit `/api/workflow-scheduler` (external cron); verify it triggers due schedules
- [ ] `/workflows`: list shows run history + next-run
- [ ] `/playground`: build a custom workspace canvas; save it
- [ ] `/workspaces/[id]`: open saved workspace; run a drill-down query; verify results
- [ ] Log every defect; fix in priority order

## Resolution

_(filled on close)_
