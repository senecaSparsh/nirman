import { redirect } from "next/navigation";

/**
 * /m/settings/team — Redirected to /m/hr/employees.
 *
 * Team & Permissions functionality has been merged into the Employee profile.
 * Each employee profile now has an "Access & Login" section (gated by
 * USERS_MANAGE permission) that handles:
 *   - Role assignment
 *   - Access scope (project/department scoping)
 *   - Module permissions
 *   - Password reset
 *   - Activate/deactivate
 *   - Provisioning login access for employees without accounts
 *
 * Users without USERS_MANAGE permission don't see the access section at all.
 */
export default function TeamPage() {
  redirect("/m/hr/employees");
}
