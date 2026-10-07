# ADR-0002: Single-node Coolify VPS, not Kubernetes/PaaS

**Status**: Accepted
**Date**: 2026 (codified 2026-10-07)
**Deciders**: repo maintainers

## Context

The app is an internal ERP for ~50 users across a handful of companies.
The infrastructure options were a managed PaaS (Render — attempted earlier),
Kubernetes, or a single VPS under an orchestrator.

## Options considered

1. **Managed PaaS (Render)** — earlier render.yaml exists; abandoned —
   cost + platform limits at this scale.
2. **Kubernetes** — real HA and autoscaling, but operational overhead
   (control plane, ingress, cert management, node pools) is absurd for one
   50-user app. ❌
3. **Single VPS + Coolify** — Docker Compose orchestration, TLS proxy,
   dashboard, container healthchecks, volumes. One bill, one mental
   model. ✅

## Decision

Single VPS, Coolify-managed Compose stack: `web` + `db` + `scheduler` +
`backup`. The app carries 21 self-healing layers (see `AGENTS.md`) to
approximate the reliability features k8s would give for free — crash
restart, zombie detection, memory watchdog, graceful drain, health probes.

## Consequences

- **+** Deploys are `deploy-prod.sh`; ops is `prod-health-check.sh`.
- **+** Cost and cognitive load are minimal.
- **−** Single point of failure at the node — mitigated by snapshots +
  restore procedure (`docs/DISASTER-RECOVERY.md`), not eliminated.
- **−** No canary/staged rollouts.
- **Revisit when** user count or uptime SLO demands real HA — the app is
  already ~stateless (in-memory caches/rate-limiter are the only in-process
  state), so horizontal scaling is a Redis away (`docs/CAPACITY.md` §3).
