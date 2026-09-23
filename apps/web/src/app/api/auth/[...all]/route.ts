import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@nirman/db";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(auth);

/**
 * Email/password sign-in gates on `user.active` — a deactivated employee
 * must not get a session that 403s on every API (the UI shows a broken
 * shell, not a clear "account inactive" state). Phone sign-in already
 * filters active-only in /api/auth/phone-password.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.pathname.endsWith("/sign-in/email")) {
    const body = await req.clone().json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
    if (email) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { active: true },
      });
      // Unknown users fall through to Better-Auth's own invalid-credentials
      // error — don't leak whether the account exists or is deactivated.
      if (user && !user.active) {
        return NextResponse.json(
          { error: "Your account is inactive. Contact your administrator." },
          { status: 403 },
        );
      }
    }
  }
  return handler.POST(req);
}

export const { GET } = handler;
