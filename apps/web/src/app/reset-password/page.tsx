import { redirect } from "next/navigation";

/**
 * Password resets are admin-managed, not self-service. Employees contact
 * their administrator, who resets the password from Team settings
 * (POST /api/users/[id]/reset-password). This page redirects to /sign-in
 * so old bookmarks don't 404.
 */
export default function ResetPasswordPage() {
  redirect("/sign-in");
}
