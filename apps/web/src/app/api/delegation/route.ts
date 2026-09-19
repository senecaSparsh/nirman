import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getActingRole, getCompany, getOwnRole, json, requireUser } from "@/lib/server";

/**
 * /api/delegation — authority delegation ("out of office").
 *
 * A member hands their authority to another member of the SAME company
 * until an end time. While active, the delegate's permission checks and
 * approval-routing rank resolve with the delegator's role
 * (getActingDelegations/getActingRole in lib/server.ts), and audit rows
 * record onBehalfOfId = the delegator.
 *
 * GET    → { mine, incoming, delegations (admin), members }
 * PUT    → { delegateMembershipId, endsAt, note?, membershipId? }
 *          membershipId only for OWNER/ADMIN managing someone else's.
 * DELETE → { membershipId? } — clears the delegation.
 */

async function myMembership(userId: string, companyId: string) {
  return prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: {
      id: true,
      role: true,
      approvalsDelegatedToId: true,
      delegationStartedAt: true,
      delegationEndsAt: true,
      delegationNote: true,
      approvalsDelegatedTo: {
        select: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
}

export const GET = apiHandler(async () => {
  const user = await requireUser();
  const company = await getCompany();

  const membership = await myMembership(user.id, company.id);
  if (!membership) {
    return json({ mine: null, incoming: [], delegations: [], members: [] });
  }

  const now = new Date();
  // Acting role for read visibility — a delegate holding admin authority
  // should see the same delegation list the delegator would.
  const actingRole = await getActingRole();
  const isAdmin = actingRole === "OWNER" || actingRole === "ADMIN";

  const [incoming, delegations, members] = await Promise.all([
    // Memberships that have delegated their authority TO me right now
    prisma.userCompany.findMany({
      where: {
        companyId: company.id,
        active: true,
        approvalsDelegatedToId: membership.id,
        delegationEndsAt: { gt: now },
      },
      select: {
        id: true,
        role: true,
        delegationEndsAt: true,
        delegationNote: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    // Admin view: every active delegation in the company
    isAdmin
      ? prisma.userCompany.findMany({
          where: {
            companyId: company.id,
            approvalsDelegatedToId: { not: null },
          },
          select: {
            id: true,
            role: true,
            delegationEndsAt: true,
            delegationNote: true,
            user: { select: { id: true, name: true } },
            approvalsDelegatedTo: {
              select: { user: { select: { id: true, name: true } } },
            },
          },
          orderBy: { delegationEndsAt: "asc" },
        })
      : Promise.resolve([]),
    // Members I can delegate to (active, not hidden, not me)
    prisma.userCompany.findMany({
      where: {
        companyId: company.id,
        active: true,
        userId: { not: user.id },
        user: { active: true, isHidden: { not: true } },
      },
      select: {
        id: true,
        role: true,
        user: { select: { id: true, name: true, email: true, designation: true } },
      },
      orderBy: { user: { name: "asc" } },
      take: 200,
    }),
  ]);

  return json({
    mine: membership.approvalsDelegatedToId
      ? {
          delegateName: membership.approvalsDelegatedTo?.user.name ?? null,
          delegateUserId: membership.approvalsDelegatedTo?.user.id ?? null,
          endsAt: membership.delegationEndsAt?.toISOString() ?? null,
          startedAt: membership.delegationStartedAt?.toISOString() ?? null,
          note: membership.delegationNote,
          expired:
            membership.delegationEndsAt != null && membership.delegationEndsAt <= now,
        }
      : null,
    incoming: incoming.map((d) => ({
      membershipId: d.id,
      userId: d.user.id,
      name: d.user.name,
      email: d.user.email,
      role: d.role,
      endsAt: d.delegationEndsAt?.toISOString() ?? null,
      note: d.delegationNote,
    })),
    delegations: delegations.map((d) => ({
      membershipId: d.id,
      userId: d.user.id,
      name: d.user.name,
      role: d.role,
      delegateName: d.approvalsDelegatedTo?.user.name ?? null,
      endsAt: d.delegationEndsAt?.toISOString() ?? null,
      note: d.delegationNote,
      expired: d.delegationEndsAt != null && d.delegationEndsAt <= now,
    })),
    members: members.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      designation: m.user.designation,
    })),
    isAdmin,
  });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const body = (await req.json().catch(() => null)) as {
    delegateMembershipId?: string;
    endsAt?: string;
    note?: string;
    membershipId?: string;
  } | null;

  if (!body?.delegateMembershipId || !body.endsAt) {
    return json({ error: "delegateMembershipId and endsAt are required" }, { status: 400 });
  }
  const endsAt = new Date(body.endsAt);
  if (Number.isNaN(endsAt.getTime())) {
    return json({ error: "endsAt must be a valid date" }, { status: 400 });
  }
  const maxEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  if (endsAt <= new Date() || endsAt > maxEnd) {
    return json({ error: "endsAt must be in the future, within 90 days" }, { status: 400 });
  }

  // Own worn hat, not acting — delegating on someone else's behalf is
  // account config, not a delegated authority, and must not chain onward.
  // (getOwnRole = the caller's activeRole sans delegation, so an OWNER
  // wearing a field hat can't manage other members' delegations.)
  const ownRole = await getOwnRole();
  const isAdmin = ownRole === "OWNER" || ownRole === "ADMIN";
  const targetMembershipId = body.membershipId ?? null;
  const mine = await myMembership(user.id, company.id);
  const membershipId = targetMembershipId && isAdmin ? targetMembershipId : mine?.id;
  if (!membershipId) {
    return json({ error: "No membership found" }, { status: 404 });
  }

  // Validate the delegate is an active member of this company
  const delegate = await prisma.userCompany.findFirst({
    where: { id: body.delegateMembershipId, companyId: company.id, active: true, user: { active: true } },
    select: { id: true, userId: true },
  });
  if (!delegate) {
    return json({ error: "Delegate is not an active member of this company" }, { status: 400 });
  }

  const delegator = await prisma.userCompany.findUnique({
    where: { id: membershipId },
    select: { userId: true, companyId: true },
  });
  if (!delegator || delegator.companyId !== company.id) {
    return json({ error: "Membership not found in this company" }, { status: 404 });
  }
  if (delegate.userId === delegator.userId) {
    return json({ error: "You cannot delegate to yourself" }, { status: 400 });
  }

  // No direct cycles: the delegate must not currently be delegating back
  const back = await prisma.userCompany.findFirst({
    where: {
      companyId: company.id,
      userId: delegate.userId,
      approvalsDelegatedToId: membershipId,
      delegationEndsAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (back) {
    return json({ error: "That member has already delegated to you — a two-way loop isn't allowed" }, { status: 400 });
  }

  await prisma.userCompany.update({
    where: { id: membershipId },
    data: {
      approvalsDelegatedToId: delegate.id,
      delegationStartedAt: new Date(),
      delegationEndsAt: endsAt,
      delegationNote: body.note?.slice(0, 300) ?? null,
    },
  });

  // Notify the delegate — they need to know they're now the approver.
  try {
    const delegatorUser = await prisma.user.findUnique({ where: { id: delegator.userId }, select: { name: true } });
    const { createInAppNotification } = await import("@nirman/services");
    await createInAppNotification({
      companyId: company.id,
      userId: delegate.userId,
      eventType: "delegation.granted",
      title: "Approval authority delegated to you",
      message: `${delegatorUser?.name ?? "A member"} delegated their authority to you until ${endsAt.toLocaleDateString("en-IN")}${body.note ? ` — ${body.note}` : ""}`,
      link: "/m/hr/pending",
    });
  } catch {
    // notification is best-effort
  }

  return json({ ok: true });
});

export const DELETE = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const body = (await req.json().catch(() => ({}))) as { membershipId?: string };

  // Own worn hat — same reasoning as PUT (see above).
  const ownRole = await getOwnRole();
  const isAdmin = ownRole === "OWNER" || ownRole === "ADMIN";
  const mine = await myMembership(user.id, company.id);
  const membershipId = body.membershipId && isAdmin ? body.membershipId : mine?.id;
  if (!membershipId) {
    return json({ error: "No membership found" }, { status: 404 });
  }

  await prisma.userCompany.update({
    where: { id: membershipId },
    data: {
      approvalsDelegatedToId: null,
      delegationStartedAt: null,
      delegationEndsAt: null,
      delegationNote: null,
    },
  });

  return json({ ok: true });
});
