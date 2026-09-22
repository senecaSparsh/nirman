import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json } from "@/lib/server";
import { defaultScopeType } from "@nirman/services";
import { withTimeout } from "@/lib/timeout";

/**
 * POST /api/cron/integrity — nightly authority/drift auditor.
 *
 * The access model has invariants that can silently drift (hat sets vs
 * hierarchy levels, dual reportsTo fields, stale delegations, orphaned
 * links). This job detects drift and notifies every tier-1 member via an
 * in-app digest — silent inconsistency becomes a daily report instead of
 * a future leak.
 *
 * Checks (per company):
 *  1. H1 employee records whose linked account holds no tier-1 hat, and
 *     tier-1 members whose employee record isn't H1 (level↔tier divergence)
 *  2. activeRole outside the held set ({role} ∪ secondaryRoles)
 *  3. reportsTo drift — employee.reportsToEmployeeId vs membership
 *     reportsToUserCompanyId pointing at different people when both linked
 *  4. Employee with userId but no active membership in that company
 *  5. Delegations whose endsAt has passed but approvalsDelegatedToId is set
 *  6. reportsTo cycles on the employee side
 *  7. CompanyPhone rows assigned to users with no active membership
 *  8. Members with no live user (userId pointing at an inactive/deleted user)
 *
 * Auth: CRON_SECRET header — same as /api/cron/backup. Scheduled daily via
 * scheduler.sh; also fired once at boot by the scheduler sidecar.
 */

const TIER1 = new Set(["OWNER", "ADMIN", "DEVELOPER"]);
const MAX_REPORT = 50;

type Finding = { check: string; detail: string };

export const POST = apiHandler(async (req: NextRequest) => {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (!(process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production")) {
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return withTimeout(runAudit(), 120_000, "Integrity audit timed out");
}, { skipSession: true, rateLimit: false });

async function runAudit(): Promise<Response> {
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  const summary: { companyId: string; company: string; findings: number }[] = [];

  for (const company of companies) {
    const findings: Finding[] = [];
    const cid = company.id;

    const [memberships, employees] = await Promise.all([
      prisma.userCompany.findMany({
        where: { companyId: cid },
        select: {
          id: true, userId: true, role: true, secondaryRoles: true, activeRole: true,
          active: true, reportsToUserCompanyId: true, scopeType: true,
          approvalsDelegatedToId: true, delegationEndsAt: true,
          user: { select: { name: true, active: true, isHidden: true, role: true } },
        },
      }),
      prisma.employee.findMany({
        where: { companyId: cid, deletedAt: null },
        select: { id: true, name: true, userId: true, hierarchyLevel: true, reportsToEmployeeId: true, active: true, phone: true, departmentId: true },
      }),
    ]);

    const empByUserId = new Map(employees.filter((e) => e.userId).map((e) => [e.userId!, e]));
    const empById = new Map(employees.map((e) => [e.id, e]));
    const memberByUserId = new Map(memberships.map((m) => [m.userId, m]));
    const memberById = new Map(memberships.map((m) => [m.id, m]));

    // 1. level↔tier divergence
    for (const e of employees) {
      if (e.hierarchyLevel === 1 && e.userId) {
        const m = memberByUserId.get(e.userId);
        const held = m ? new Set([m.role, ...m.secondaryRoles]) : new Set<string>();
        const hasTier1 = [...held].some((r) => TIER1.has(r));
        if (m && m.active && !hasTier1) {
          findings.push({ check: "h1-without-tier1", detail: `${e.name} is H1 but holds no top-tier hat (${m.role})` });
        }
      }
    }
    for (const m of memberships) {
      if (!m.active) continue;
      const held = new Set([m.role, ...m.secondaryRoles]);
      if ([...held].some((r) => TIER1.has(r))) {
        const e = empByUserId.get(m.userId);
        if (e && e.hierarchyLevel !== 1) {
          findings.push({ check: "tier1-without-h1", detail: `${m.user.name} holds a top-tier hat (${m.role}) but their employee record is H${e.hierarchyLevel ?? "?"}` });
        }
      }
    }

    // 2. stale activeRole
    for (const m of memberships) {
      if (m.activeRole) {
        const held = new Set([m.role, ...m.secondaryRoles]);
        if (!held.has(m.activeRole)) {
          findings.push({ check: "stale-activeRole", detail: `${m.user.name} wears "${m.activeRole}" which is not in their held set` });
        }
      }
    }

    // 3. reportsTo drift (both sides linked, different people)
    for (const e of employees) {
      if (!e.userId || !e.reportsToEmployeeId) continue;
      const m = memberByUserId.get(e.userId);
      const mgrEmp = empById.get(e.reportsToEmployeeId);
      const mgrMember = mgrEmp?.userId ? memberByUserId.get(mgrEmp.userId) : null;
      if (m && mgrMember && m.reportsToUserCompanyId !== mgrMember.id) {
        findings.push({ check: "reportsTo-drift", detail: `${e.name}: org chart says ${mgrEmp?.name}, membership chain says ${m.reportsToUserCompanyId ? (memberById.get(m.reportsToUserCompanyId)?.user.name ?? "?") : "nobody"}` });
      }
    }

    // 4. employee with userId but no active membership
    for (const e of employees) {
      if (e.userId) {
        const m = memberByUserId.get(e.userId);
        if (!m || !m.active) {
          findings.push({ check: "orphan-employee-user", detail: `${e.name} has a login but no active membership` });
        }
      }
    }

    // 5. expired-but-live delegations
    for (const m of memberships) {
      if (m.approvalsDelegatedToId && m.delegationEndsAt && m.delegationEndsAt < new Date()) {
        findings.push({ check: "stale-delegation", detail: `${m.user.name}'s delegation expired but is still set` });
      }
    }

    // 6. employee reportsTo cycles
    for (const e of employees) {
      let cur = e.reportsToEmployeeId;
      const visited = new Set<string>([e.id]);
      let hops = 0;
      while (cur && hops++ < 20) {
        if (visited.has(cur)) {
          findings.push({ check: "reportsTo-cycle", detail: `${e.name}'s reporting line loops` });
          break;
        }
        visited.add(cur);
        cur = empById.get(cur)?.reportsToEmployeeId ?? null;
      }
    }

    // 7. pool numbers on dead accounts
    const phones = await prisma.companyPhone.findMany({
      where: { companyId: cid, assignedToUserId: { not: null } },
      select: { phoneNumber: true, assignedToUserId: true },
    });
    for (const p of phones) {
      const m = memberByUserId.get(p.assignedToUserId!);
      if (!m || !m.active) {
        findings.push({ check: "phone-on-dead-account", detail: `${p.phoneNumber} assigned to an inactive member` });
      }
    }

    // 8. members whose user row is gone/inactive
    for (const m of memberships) {
      if (m.active && (!m.user.active || m.user.isHidden)) {
        findings.push({ check: "member-dead-user", detail: `${m.user.name}'s membership is active but the user is not` });
      }
    }

    // 9. reportsTo pointing at inactive people — org-chart ghosts on the
    // employee side AND dead ends in the approval chain on the member side.
    for (const e of employees) {
      if (!e.reportsToEmployeeId) continue;
      const mgr = empById.get(e.reportsToEmployeeId);
      if (mgr && !mgr.active) {
        findings.push({ check: "reportsTo-inactive", detail: `${e.name} reports to ${mgr.name}, who is inactive` });
      }
    }
    for (const m of memberships) {
      if (!m.reportsToUserCompanyId) continue;
      const mgr = memberById.get(m.reportsToUserCompanyId);
      if (mgr && !mgr.active) {
        findings.push({ check: "reportsTo-inactive", detail: `${m.user.name}'s approval line points to inactive ${mgr.user.name}` });
      }
    }

    // 10. duplicate employee phones — the same person entered twice
    // (classic rehire mistake) splits their history across two records.
    const phoneMap = new Map<string, string[]>();
    for (const e of employees) {
      if (!e.active || !e.phone) continue;
      const digits = e.phone.replace(/\D/g, "");
      if (digits.length < 8) continue;
      phoneMap.set(digits, [...(phoneMap.get(digits) ?? []), e.name]);
    }
    for (const [phone, names] of phoneMap) {
      if (names.length > 1) {
        findings.push({ check: "duplicate-employee-phone", detail: `phone ${phone} appears on ${names.length} active employees: ${names.join(", ")}` });
      }
    }

    // 11. department orphans — an active employee with no department is
    // invisible to every department-scoped HR user; only company-scoped
    // viewers can even find them.
    for (const e of employees) {
      if (e.active && e.departmentId === null) {
        findings.push({ check: "dept-orphan", detail: `${e.name} is active but has no department — invisible to dept-scoped HR` });
      }
    }

    // 12. role-mirror drift — User.role mirrors membership.role; when they
    // diverge, list views and the held-set union read a stale hat.
    for (const m of memberships) {
      if (m.active && m.user.role && m.user.role !== m.role) {
        findings.push({ check: "role-mirror-drift", detail: `${m.user.name}: account role "${m.user.role}" ≠ membership role "${m.role}"` });
      }
    }

    // 13. demotion scope drift — every held role defaults to a narrow scope
    // but the membership still carries explicit COMPANY scope (usually a
    // leftover from a senior role). Review: narrow it or it's intentional.
    // Custom roles resolve their default scope via baseRole (null → narrow).
    const customRoleRows = await prisma.customRole.findMany({
      where: { companyId: cid },
      select: { key: true, baseRole: true },
    });
    const customRoleBase = new Map(customRoleRows.map((r) => [r.key, r.baseRole ?? "SUPERVISOR"]));
    const customRoleKeys = new Set(customRoleRows.map((r) => r.key));

    // 13b. phantom hats — a held CUSTOM_* role that was deleted still sits
    // in the held set (fail-closed on permissions, but invisible until
    // someone audits the membership).
    for (const m of memberships) {
      const phantom = [m.role, ...m.secondaryRoles].filter((r) => r.startsWith("CUSTOM_") && !customRoleKeys.has(r));
      if (phantom.length > 0) {
        findings.push({ check: "phantom-role", detail: `${m.user.name} holds deleted custom role(s): ${phantom.join(", ")}` });
      }
    }
    const defaultScopeFor = (role: string) =>
      defaultScopeType(role.startsWith("CUSTOM_") ? (customRoleBase.get(role) ?? "SUPERVISOR") : role);
    for (const m of memberships) {
      if (!m.active || m.scopeType !== "COMPANY") continue;
      const held = [m.role, ...m.secondaryRoles];
      if (held.every((r) => defaultScopeFor(r) !== "COMPANY")) {
        findings.push({ check: "scope-drift", detail: `${m.user.name} holds only scoped roles but has company-wide access — review` });
      }
    }

    // 14. inverted reporting lines — a senior reporting to a junior
    // (higher hierarchy number reports to lower) is almost always an error.
    for (const e of employees) {
      if (!e.reportsToEmployeeId || e.hierarchyLevel == null) continue;
      const mgr = empById.get(e.reportsToEmployeeId);
      if (mgr?.hierarchyLevel != null && mgr.hierarchyLevel > e.hierarchyLevel) {
        findings.push({ check: "reportsTo-inverted", detail: `H${e.hierarchyLevel} ${e.name} reports to H${mgr.hierarchyLevel} ${mgr.name}` });
      }
    }

    // 15. stale off-site reviews — a PENDING off-site check-in older than a
    // week sits as provisional PRESENT forever; surface it so HR actually
    // decides (approve → stays, reject → absent).
    const staleOffsite = await prisma.workerAttendance.count({
      where: {
        companyId: cid,
        offSiteReview: "PENDING",
        date: { lt: new Date(Date.now() - 7 * 86400_000) },
      },
    });
    if (staleOffsite > 0) {
      findings.push({ check: "offsite-review-stale", detail: `${staleOffsite} off-site check-in(s) pending review for over a week` });
    }

    // ── Report: one digest notification to every tier-1 member ──
    if (findings.length > 0) {
      const tier1UserIds = memberships
        .filter((m) => m.active && [m.role, ...m.secondaryRoles].some((r) => TIER1.has(r)))
        .map((m) => m.userId);
      const body = findings.slice(0, MAX_REPORT).map((f) => `• ${f.detail}`).join("\n");
      const title = `Integrity audit: ${findings.length} issue${findings.length === 1 ? "" : "s"}`;
      for (const uid of tier1UserIds) {
        await prisma.inAppNotification.create({
          data: {
            companyId: cid,
            userId: uid,
            eventType: "SYSTEM",
            title,
            message: findings.length > MAX_REPORT ? `${body}\n… and ${findings.length - MAX_REPORT} more` : body,
            link: "/m/settings/company",
            metadata: { check: "integrity-audit", count: findings.length, checks: [...new Set(findings.map((f) => f.check))] },
          },
        }).catch(() => {});
      }
    }

    summary.push({ companyId: cid, company: company.name, findings: findings.length });
  }

  return json({ ok: true, ranAt: new Date().toISOString(), summary });
}
