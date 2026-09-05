import { prisma } from "@nirman/db";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Feedback Service — instant in-app feedback from any user.
 *
 * Users capture a screenshot (auto-grabbed via html-to-image), optionally
 * record a voice note (MediaRecorder API), and write free-text. All
 * feedback is routed to the DEVELOPER (god-mode) + OWNER accounts for
 * triage. The Feedback record stores the page URL + user agent for
 * context so the developer can reproduce the issue.
 *
 * Lifecycle: NEW → READ → RESOLVED (→ ARCHIVED).
 */

/**
 * Validate a feedback message.
 * Pure function — no DB access.
 *
 * Throws if message is empty/whitespace or exceeds 5000 characters.
 */
export function validateFeedbackMessage(message: string): void {
  if (!message.trim()) {
    throw new ServiceError("Feedback message cannot be empty.", 400);
  }
  if (message.length > 5000) {
    throw new ServiceError("Feedback message is too long (max 5000 characters).", 400);
  }
}

/**
 * Validate that a feedback status transition is allowed.
 * Pure function — no DB access.
 *
 * Lifecycle: NEW → READ → RESOLVED → ARCHIVED
 * REOPENED can go back to READ from RESOLVED.
 */
export function isFeedbackTransitionAllowed(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed: Record<string, string[]> = {
    NEW: ["READ", "ARCHIVED"],
    READ: ["RESOLVED", "ARCHIVED", "NEW"],
    RESOLVED: ["ARCHIVED", "READ"],
    ARCHIVED: [],
  };
  return allowed[from]?.includes(to) ?? false;
}

export interface CreateFeedbackInput {
  userId: string;
  companyId?: string | null;
  message: string;
  category?: string;
  screenshotUploadId?: string | null;
  voiceUploadId?: string | null;
  currentUrl: string;
  userAgent?: string | null;
}

/**
 * Create a feedback entry. Any authenticated user can submit feedback.
 * The screenshot and voice note are already uploaded via /api/uploads
 * before this is called — we just store the upload IDs.
 */
export async function createFeedback(input: CreateFeedbackInput) {
  if (!input.message.trim()) {
    throw new ServiceError("Feedback message cannot be empty.", 400);
  }
  if (input.message.length > 5000) {
    throw new ServiceError("Feedback message is too long (max 5000 characters).", 400);
  }

  const feedback = await prisma.feedback.create({
    data: {
      userId: input.userId,
      companyId: input.companyId ?? null,
      message: input.message.trim(),
      category: (input.category as any) ?? "OTHER",
      screenshotUploadId: input.screenshotUploadId ?? null,
      voiceUploadId: input.voiceUploadId ?? null,
      currentUrl: input.currentUrl,
      userAgent: input.userAgent ?? null,
    },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      screenshotUpload: { select: { id: true, url: true, mimeType: true, originalName: true } },
      voiceUpload: { select: { id: true, url: true, mimeType: true, originalName: true } },
    },
  });

  // Log the feedback submission for audit trail.
  try {
    await logAction(prisma, {
      userId: input.userId,
      companyId: input.companyId ?? undefined,
      action: "FEEDBACK_CREATE",
      entityType: "Feedback",
      entityId: feedback.id,
      after: { category: feedback.category, currentUrl: feedback.currentUrl },
    });
  } catch {
    // audit failure must never block feedback submission
  }

  return feedback;
}

/**
 * List feedback entries. Only DEVELOPER and OWNER (and ADMIN) roles
 * can view the feedback inbox. Supports filtering by status + category.
 */
export async function listFeedback(filters: {
  status?: string;
  category?: string;
  limit?: number;
  offset?: number;
}) {
  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.category) where.category = filters.category;

  const [items, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(filters.limit ?? 50, 200),
      skip: filters.offset ?? 0,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        company: { select: { id: true, name: true } },
        screenshotUpload: { select: { id: true, url: true, mimeType: true } },
        voiceUpload: { select: { id: true, url: true, mimeType: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.feedback.count({ where }),
  ]);

  return { items, total };
}

/**
 * Get a single feedback entry by ID (with full details).
 */
export async function getFeedback(id: string) {
  const feedback = await prisma.feedback.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, phone: true } },
      company: { select: { id: true, name: true } },
      screenshotUpload: { select: { id: true, url: true, mimeType: true, originalName: true, size: true } },
      voiceUpload: { select: { id: true, url: true, mimeType: true, originalName: true, size: true } },
      resolvedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!feedback) {
    throw new ServiceError("Feedback not found.", 404);
  }
  return feedback;
}

/**
 * Mark a feedback entry as READ (when the developer/owner opens it).
 * Only transitions NEW → READ; already-read/resolved entries are unchanged.
 */
export async function markFeedbackRead(id: string) {
  const feedback = await prisma.feedback.findUnique({ where: { id }, select: { status: true } });
  if (!feedback) {
    throw new ServiceError("Feedback not found.", 404);
  }
  if (feedback.status === "NEW") {
    return prisma.feedback.update({
      where: { id },
      data: { status: "READ" },
    });
  }
  return prisma.feedback.findUnique({ where: { id } });
}

/**
 * Resolve a feedback entry. The resolver (DEVELOPER/OWNER/ADMIN) can
 * add an optional resolution note. Transitions to RESOLVED + records
 * who resolved it and when.
 */
export async function resolveFeedback(id: string, resolvedById: string, resolutionNote?: string) {
  const feedback = await prisma.feedback.findUnique({ where: { id }, select: { status: true } });
  if (!feedback) {
    throw new ServiceError("Feedback not found.", 404);
  }

  const updated = await prisma.feedback.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolvedById,
      resolvedAt: new Date(),
      resolutionNote: resolutionNote?.trim() || null,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });

  try {
    await logAction(prisma, {
      userId: resolvedById,
      action: "FEEDBACK_RESOLVE",
      entityType: "Feedback",
      entityId: id,
      after: { status: "RESOLVED", resolutionNote: resolutionNote ?? null },
    });
  } catch {
    // audit failure must never block resolution
  }

  return updated;
}

/**
 * Archive a feedback entry (keep for history but remove from active queue).
 */
export async function archiveFeedback(id: string) {
  const feedback = await prisma.feedback.findUnique({ where: { id }, select: { status: true } });
  if (!feedback) {
    throw new ServiceError("Feedback not found.", 404);
  }
  return prisma.feedback.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
}

/**
 * Reopen a feedback entry (RESOLVED/ARCHIVED → READ).
 */
export async function reopenFeedback(id: string) {
  const feedback = await prisma.feedback.findUnique({ where: { id }, select: { status: true } });
  if (!feedback) {
    throw new ServiceError("Feedback not found.", 404);
  }
  return prisma.feedback.update({
    where: { id },
    data: {
      status: "READ",
      resolvedById: null,
      resolvedAt: null,
      resolutionNote: null,
    },
  });
}

/**
 * Get feedback stats for the inbox dashboard.
 */
export async function getFeedbackStats() {
  const [byStatus, total] = await Promise.all([
    prisma.feedback.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.feedback.count(),
  ]);
  const stats: Record<string, number> = {};
  for (const s of byStatus) stats[s.status] = s._count;
  return { total, byStatus: stats };
}
