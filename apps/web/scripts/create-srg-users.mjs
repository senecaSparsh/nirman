/**
 * create-srg-users.mjs — Production script to create SRG REALCON company
 * and 7 team member accounts with proper RBAC roles, H1–H4 hierarchy,
 * phone-based login, call-system phone numbers, and unique passwords.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  WHAT THIS SCRIPT CREATES (all idempotent — safe to re-run):
 *
 *  1. Company: "SRG REALCON" (parent, parentCompanyId = null)
 *  2. 7 Users with RBAC roles + phone-based login (phoneNormalized)
 *  3. 7 UserCompany memberships with reportsTo hierarchy wiring
 *  4. 7 Credential Accounts (scrypt-hashed passwords, same as Better-Auth)
 *  5. 7 Employee records with hierarchyLevel (H1–H4)
 *  6. 7 CompanyPhone records (for the call/telephony system)
 *  7. 7 PhoneAssignment records (assignment history)
 *
 *  HIERARCHY:
 *    H1  Vardaan Kumar   OWNER              7017988293  reportsTo: null
 *    H1  Sanjeev Kumar   ADMIN              9412230391  reportsTo: null
 *    H2  Anurag Garg     PROJECT_DIRECTOR   7302920202  reportsTo: Vardaan
 *    H3  Manish Kumar    FINANCE_HEAD       7302920201  reportsTo: Vardaan
 *    H3  Raviraj Singh   PROCUREMENT_MGR    9520002752  reportsTo: Vardaan
 *    H4  Mani Singh      SALES_MANAGER      7302920203  reportsTo: Manish
 *    H4  Yash Saxena     SITE_ENGINEER      7302920205  reportsTo: Anurag
 *
 *  PASSWORDS: Unique random 16-char passwords generated per user.
 *             mustChangePassword = false (users keep their assigned password).
 *             Passwords are printed at the end — copy them before closing.
 *             On subsequent runs (after users exist), passwords are NOT
 *             reset — the script exits silently.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  AUTO-RUN: This script is wired into docker-entrypoint.sh and runs on
 *  every container start. It is fully idempotent:
 *    - First run (SRG REALCON doesn't exist): creates everything, prints
 *      the credential table to stdout (visible in Coolify deploy logs).
 *    - Subsequent runs (SRG REALCON exists with all 7 users): exits
 *      silently with a one-line "already provisioned" message.
 *
 *  MANUAL RUN (on the Coolify VPS, inside the running web container):
 *
 *    1. SSH into the VPS:
 *         ssh root@<your-server-ip>
 *    2. Find the web container name:
 *         docker ps | grep nirman    # or grep web
 *    3. Run it:
 *         docker exec -it <container> node /app/apps/web/scripts/create-srg-users.mjs
 *
 *  The script reads DATABASE_URL from the container's environment.
 *
 * ──────────────────────────────────────────────────────────────────────
 */
import { randomBytes, scrypt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ── Resolve the Prisma client path relative to this script ──
// In the container, this script is at /app/apps/web/scripts/create-srg-users.mjs
// The generated Prisma client is at /app/packages/db/src/generated/prisma/index.js
// From apps/web/scripts/ → ../../../packages/db/src/generated/prisma (3 levels up to root)
const __dirname = dirname(fileURLToPath(import.meta.url));
const PRISMA_CLIENT_PATH = join(__dirname, "..", "..", "..", "packages", "db", "src", "generated", "prisma", "index.js");

const { PrismaClient } = await import(PRISMA_CLIENT_PATH);
const prisma = new PrismaClient({
  log: ["error"],
  transactionOptions: { maxWait: 10_000, timeout: 30_000 },
});

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Normalize to 10-digit Indian mobile (strip +91, spaces, dashes).
 * Used for User.phoneNormalized — matches what users type in the sign-in
 * form (placeholder "98765 43210" → 10 digits).
 */
function normalizePhone10(input) {
  let digits = input.replace(/\D/g, "");
  // Strip country code 91 if 12 digits
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  // Strip leading 0 if 11 digits
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits; // 10 digits
}

/**
 * Normalize to 12-digit (91 + 10 digits) for CompanyPhone.phoneNormalized.
 * The call/telephony system receives numbers in E.164-ish format from
 * Twilio/Exotel, so CompanyPhone stores the full 12-digit version.
 */
function normalizePhone12(input) {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 11 && digits.startsWith("0")) digits = "91" + digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 13 && digits.startsWith("910")) digits = "91" + digits.slice(3);
  return digits;
}

/**
 * Format a 10-digit number for display: "+91 70179 88293"
 */
function formatPhoneDisplay(phone10) {
  return `+91 ${phone10.slice(0, 5)} ${phone10.slice(5)}`;
}

/**
 * Scrypt-hash a password using the SAME parameters as Better-Auth
 * (@better-auth/utils/password). Format: "salt:hash" (both hex).
 *
 * Config: N=16384, r=16, p=1, dkLen=64 — identical to better-auth.
 */
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      },
    );
  });
  return `${salt}:${key.toString("hex")}`;
}

/**
 * Generate a random 16-character password (alphanumeric, unambiguous chars).
 */
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  let pw = "";
  for (let i = 0; i < 16; i++) pw += chars[bytes[i] % chars.length];
  return pw;
}

// ═══════════════════════════════════════════════════════════════════════
//  USER DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════

const COMPANY_NAME = "SRG REALCON";

/**
 * Users in creation order (H1 first so reportsTo targets exist).
 * `reportsTo` is the key of another user in this array (or null for top).
 */
const USERS = [
  {
    key: "vardaan",
    name: "Vardaan Kumar",
    designation: "Owner",
    role: "OWNER",
    hierarchyLevel: 1,
    phone: "7017988293",
    reportsTo: null,
    department: "Management",
  },
  {
    key: "sanjeev",
    name: "Sanjeev Kumar",
    designation: "Co-Admin / Owner",
    role: "ADMIN",
    hierarchyLevel: 1,
    phone: "9412230391",
    reportsTo: null,
    department: "Management",
  },
  {
    key: "anurag",
    name: "Anurag Garg",
    designation: "Civil Head",
    role: "PROJECT_DIRECTOR",
    hierarchyLevel: 2,
    phone: "7302920202",
    reportsTo: "vardaan",
    department: "Construction",
  },
  {
    key: "manish",
    name: "Manish Kumar",
    designation: "Accounts Head",
    role: "FINANCE_HEAD",
    hierarchyLevel: 3,
    phone: "7302920201",
    reportsTo: "vardaan",
    department: "Finance",
  },
  {
    key: "raviraj",
    name: "Raviraj Singh",
    designation: "Purchase Head",
    role: "PROCUREMENT_MANAGER",
    hierarchyLevel: 3,
    phone: "9520002752",
    reportsTo: "vardaan",
    department: "Procurement",
  },
  {
    key: "mani",
    name: "Mani Singh",
    designation: "Tele Calling Executive",
    role: "SALES_MANAGER",
    hierarchyLevel: 4,
    phone: "7302920203",
    reportsTo: "manish",
    department: "Sales",
  },
  {
    key: "yash",
    name: "Yash Saxena",
    designation: "Junior Engineer",
    role: "SITE_ENGINEER",
    hierarchyLevel: 4,
    phone: "7302920205",
    reportsTo: "anurag",
    department: "Construction",
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SRG REALCON — Production User Creation Script");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Database: ${process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? "(from env)"}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log("");

  // ── 0a. Cleanup: soft-delete auto-created "My Company" entries ──
  // getCompany() in lib/server.ts auto-creates a company named "My Company"
  // when an authenticated user has no company membership. This can happen
  // during failed login attempts before the auth fix was deployed. These
  // ghost companies have no real data (no projects, stock, etc.) and confuse
  // users who see them in the company picker. We soft-delete them here.
  const ghostCompanies = await prisma.company.findMany({
    where: { name: "My Company", deletedAt: null },
    select: {
      id: true,
      createdAt: true,
      _count: { select: { projects: true, stockLocations: true, materials: true, customers: true, suppliers: true } },
    },
  });
  for (const ghost of ghostCompanies) {
    const hasRealData = ghost._count.projects > 0 || ghost._count.stockLocations > 0 || ghost._count.materials > 0 || ghost._count.customers > 0 || ghost._count.suppliers > 0;
    if (!hasRealData) {
      await prisma.company.update({
        where: { id: ghost.id },
        data: { deletedAt: new Date() },
      });
      // Also soft-delete the UserCompany memberships so getCompany() skips them
      await prisma.userCompany.updateMany({
        where: { companyId: ghost.id },
        data: { role: "INACTIVE" },
      });
      console.log(`  Cleaned up auto-created "My Company" (id: ${ghost.id}, created: ${ghost.createdAt.toISOString()})`);
    } else {
      console.log(`  WARNING: "My Company" (id: ${ghost.id}) has real data — not deleting. Rename it in the UI.`);
    }
  }

  // ── 0b. Early-exit check: if SRG REALCON already exists with all 7 users,
  //    skip entirely. This makes the script safe to run on every deploy —
  //    it provisions once, then silently no-ops forever. ──
  const existingCompany = await prisma.company.findFirst({
    where: { name: COMPANY_NAME, deletedAt: null },
    select: { id: true },
  });
  if (existingCompany) {
    // Count users with memberships in this company whose phone matches one
    // of our 7 phone numbers. If all 7 exist, we're done.
    const ourPhones = USERS.map((u) => normalizePhone10(u.phone));
    const existingUsers = await prisma.user.count({
      where: {
        phoneNormalized: { in: ourPhones },
        active: true,
        memberships: { some: { companyId: existingCompany.id } },
      },
    });
    if (existingUsers >= USERS.length) {
      console.log(`  SRG REALCON already provisioned (${existingUsers}/${USERS.length} users found). Skipping.`);
      console.log("  To re-provision, delete the company or users first.");
      return;
    }
    console.log(`  SRG REALCON exists but only ${existingUsers}/${USERS.length} users found. Completing provisioning…`);
  }

  // ── 1. Create or find the parent company ──
  console.log("── Step 1: Company ──────────────────────────────────────");
  let company = existingCompany;
  if (company) {
    console.log(`  FOUND: ${COMPANY_NAME} (id: ${company.id})`);
  } else {
    company = await prisma.company.create({
      data: {
        name: COMPANY_NAME,
        businessType: "Real Estate Development",
        currency: "INR",
      },
    });
    console.log(`  CREATED: ${company.name} (id: ${company.id})`);
  }
  const companyId = company.id;

  // ── 2. Create users (H1 first, then H2, H3, H4) ──
  // We process in array order which is already H1→H4.
  // For each user we create: User, UserCompany, Account, Employee,
  // CompanyPhone, PhoneAssignment.
  console.log("");
  console.log("── Step 2: Users + Memberships + Accounts + Employees + Phones ──");

  const results = []; // { key, name, phone, password, role, hierarchyLevel, userId, employeeId, companyPhoneId, status }
  const userCompanyIds = {}; // key → UserCompany.id (for reportsTo wiring)

  for (const u of USERS) {
    const phone10 = normalizePhone10(u.phone);
    const phone12 = normalizePhone12(u.phone);
    const phoneDisplay = formatPhoneDisplay(phone10);
    const email = `phone+${phone12}@nirman.internal`; // placeholder email (phone is the real login ID)

    console.log(`\n  [${u.key}] ${u.name} (${u.role}, H${u.hierarchyLevel}) — ${phoneDisplay}`);

    // ── 2a. Find or create User ──
    let user = await prisma.user.findFirst({
      where: { phoneNormalized: phone10, active: true },
      select: { id: true, name: true, email: true, role: true },
    });

    let password = null;
    let userStatus = "EXISTING";

    if (!user) {
      password = generatePassword();
      user = await prisma.user.create({
        data: {
          email,
          name: u.name,
          role: u.role,
          phone: phoneDisplay,
          phoneNormalized: phone10,
          companyId,
          emailVerified: true,
          designation: u.designation,
          department: u.department,
          joiningDate: new Date(),
          mustChangePassword: false,
        },
        select: { id: true, name: true, email: true, role: true },
      });
      userStatus = "CREATED";
      console.log(`    User: CREATED (id: ${user.id})`);
    } else {
      console.log(`    User: FOUND (id: ${user.id}) — updating role/department`);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          role: u.role,
          designation: u.designation,
          department: u.department,
          companyId, // ensure default company is set
        },
      });
    }

    // ── 2b. Find or create UserCompany membership ──
    let membership = await prisma.userCompany.findFirst({
      where: { userId: user.id, companyId },
      select: { id: true, role: true, reportsToUserCompanyId: true },
    });

    if (!membership) {
      membership = await prisma.userCompany.create({
        data: {
          userId: user.id,
          companyId,
          role: u.role,
        },
        select: { id: true, role: true, reportsToUserCompanyId: true },
      });
      console.log(`    Membership: CREATED (id: ${membership.id}, role: ${u.role})`);
    } else {
      // Update role to match
      await prisma.userCompany.update({
        where: { id: membership.id },
        data: { role: u.role },
      });
      console.log(`    Membership: FOUND (id: ${membership.id}) — role updated to ${u.role}`);
    }
    userCompanyIds[u.key] = membership.id;

    // ── 2c. Find or create credential Account ──
    // IMPORTANT: We NEVER reset passwords for existing accounts. If a user
    // already has a credential account, their password stays as-is. This
    // makes the script safe to run on every deploy without locking users
    // out of their accounts.
    let account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
      select: { id: true },
    });

    if (!account) {
      // New user (or existing user without a credential account) — set a password
      const pwToHash = password ?? generatePassword();
      if (!password) password = pwToHash; // store for output
      const hashed = await hashPassword(pwToHash);
      account = await prisma.account.create({
        data: {
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: hashed,
        },
      });
      console.log(`    Account: CREATED (credential, password set)`);
    } else {
      // Existing account — DO NOT reset the password
      console.log(`    Account: FOUND (password unchanged)`);
    }

    // ── 2d. Find or create Employee record with hierarchyLevel ──
    let employee = await prisma.employee.findFirst({
      where: { userId: user.id, companyId, deletedAt: null },
      select: { id: true, hierarchyLevel: true },
    });

    if (!employee) {
      employee = await prisma.employee.create({
        data: {
          name: u.name,
          phone: phoneDisplay,
          email,
          dailyRate: 0,
          wageType: "MONTHLY",
          monthlySalary: null,
          designation: u.designation,
          joinDate: new Date(),
          active: true,
          hierarchyLevel: u.hierarchyLevel,
          companyId,
          userId: user.id,
          employmentType: "PERMANENT",
        },
        select: { id: true, hierarchyLevel: true },
      });
      console.log(`    Employee: CREATED (id: ${employee.id}, H${u.hierarchyLevel})`);
    } else {
      // Update hierarchyLevel if different
      if (employee.hierarchyLevel !== u.hierarchyLevel) {
        await prisma.employee.update({
          where: { id: employee.id },
          data: { hierarchyLevel: u.hierarchyLevel, designation: u.designation },
        });
        console.log(`    Employee: FOUND — hierarchyLevel updated to H${u.hierarchyLevel}`);
      } else {
        console.log(`    Employee: FOUND (id: ${employee.id}, H${u.hierarchyLevel})`);
      }
    }

    // ── 2e. Find or create CompanyPhone ──
    let companyPhone = await prisma.companyPhone.findFirst({
      where: { companyId, phoneNormalized: phone12, deletedAt: null },
      select: { id: true, assignedToUserId: true },
    });

    if (!companyPhone) {
      companyPhone = await prisma.companyPhone.create({
        data: {
          companyId,
          phoneNumber: phoneDisplay,
          phoneNormalized: phone12,
          numberType: "MOBILE",
          provider: "MANUAL",
          label: u.name,
          department: u.department,
          status: "ACTIVE",
          assignedToUserId: user.id,
          assignedAt: new Date(),
        },
        select: { id: true, assignedToUserId: true },
      });
      console.log(`    CompanyPhone: CREATED (id: ${companyPhone.id}, ${phoneDisplay})`);
    } else {
      // Ensure it's assigned to this user
      if (companyPhone.assignedToUserId !== user.id) {
        await prisma.companyPhone.update({
          where: { id: companyPhone.id },
          data: { assignedToUserId: user.id, assignedAt: new Date(), status: "ACTIVE" },
        });
        console.log(`    CompanyPhone: FOUND — reassigned to ${u.name}`);
      } else {
        console.log(`    CompanyPhone: FOUND (already assigned)`);
      }
    }

    // ── 2f. Create PhoneAssignment history record (if none active) ──
    const activeAssignment = await prisma.phoneAssignment.findFirst({
      where: { companyPhoneId: companyPhone.id, userId: user.id, returnedAt: null },
      select: { id: true },
    });
    if (!activeAssignment) {
      // Close any previous open assignments for this phone
      await prisma.phoneAssignment.updateMany({
        where: { companyPhoneId: companyPhone.id, returnedAt: null },
        data: { returnedAt: new Date(), reason: "Reassigned" },
      });
      await prisma.phoneAssignment.create({
        data: {
          companyPhoneId: companyPhone.id,
          userId: user.id,
          reason: "Assigned during account creation",
        },
      });
      console.log(`    PhoneAssignment: CREATED`);
    } else {
      console.log(`    PhoneAssignment: FOUND (active)`);
    }

    results.push({
      key: u.key,
      name: u.name,
      role: u.role,
      hierarchyLevel: u.hierarchyLevel,
      designation: u.designation,
      phone: phoneDisplay,
      phoneForLogin: phone10,
      password,
      userId: user.id,
      status: userStatus,
    });
  }

  // ── 3. Wire reportsTo hierarchy ──
  // Now that all UserCompany memberships exist, set the reportsTo links.
  console.log("");
  console.log("── Step 3: Reporting Hierarchy (reportsTo) ──────────────");
  for (const u of USERS) {
    if (!u.reportsTo) {
      console.log(`  ${u.name}: top-level (no reportsTo)`);
      continue;
    }
    const membershipId = userCompanyIds[u.key];
    const reportsToId = userCompanyIds[u.reportsTo];
    const reportsToUser = USERS.find((x) => x.key === u.reportsTo);
    await prisma.userCompany.update({
      where: { id: membershipId },
      data: { reportsToUserCompanyId: reportsToId },
    });
    console.log(`  ${u.name} → reports to ${reportsToUser.name}`);
  }

  // ── 4. Summary ──
  // Only print the credential table if at least one NEW user was created
  // (i.e. this is the first run). On subsequent runs where all users already
  // existed, we skip the table — there are no new passwords to show.
  const newUsers = results.filter((r) => r.status === "CREATED" && r.password);
  const existingUsers = results.filter((r) => r.status === "EXISTING");

  if (newUsers.length === 0 && existingUsers.length === results.length) {
    console.log("");
    console.log("  All SRG REALCON users already exist. No changes made.");
    console.log("  (Passwords are never reset by this script — use the admin UI to reset.)");
    console.log("");
    return;
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  CREATION COMPLETE — COPY THESE CREDENTIALS NOW");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log(`  Company: ${COMPANY_NAME} (id: ${companyId})`);
  console.log("");
  console.log("  ┌──────────────────┬────────────────────────┬───────────────────┬────────────┬──────────────────┐");
  console.log("  │ Name             │ Role                   │ H-Level           │ Phone      │ Password         │");
  console.log("  ├──────────────────┼────────────────────────┼───────────────────┼────────────┼──────────────────┤");
  for (const r of results) {
    const namePad = r.name.padEnd(16);
    const rolePad = r.role.padEnd(22);
    const hPad = `H${r.hierarchyLevel}`.padEnd(17);
    const phonePad = r.phoneForLogin.padEnd(10);
    const pwPad = (r.password ?? "(unchanged)").padEnd(16);
    console.log(`  │ ${namePad} │ ${rolePad} │ ${hPad} │ ${phonePad} │ ${pwPad} │`);
  }
  console.log("  └──────────────────┴────────────────────────┴───────────────────┴────────────┴──────────────────┘");
  console.log("");
  console.log("  LOGIN INSTRUCTIONS:");
  console.log("    • Go to the sign-in page");
  console.log("    • Select 'Phone' mode (default)");
  console.log("    • Enter the 10-digit phone number (without +91 prefix)");
  console.log("    • Enter the password shown above");
  console.log("    • Use 'Remember me' to save credentials on your device");
  console.log("");
  console.log("  CALL SYSTEM:");
  console.log("    • Each user's phone is registered as a CompanyPhone");
  console.log("    • Numbers are stored in 12-digit format (91 + 10 digits)");
  console.log("    • Incoming/outgoing calls will be tracked per user");
  console.log("");
  console.log("  HIERARCHY:");
  console.log("    • H1 owners (Vardaan, Sanjeev) are at the top");
  console.log("    • H2/H3 report to Vardaan (Owner)");
  console.log("    • H4: Mani Singh reports to Manish Kumar (Accounts Head)");
  console.log("    • H4: Yash Saxena reports to Anurag Garg (Civil Head)");
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
}

main()
  .catch((e) => {
    console.error("");
    console.error("═══════════════════════════════════════════════════════════════");
    console.error("  SCRIPT FAILED");
    console.error("═══════════════════════════════════════════════════════════════");
    console.error(e);
    console.error("");
    console.error("No changes were committed if the error occurred before any DB writes.");
    console.error("If the error occurred mid-way, re-run the script — it is idempotent.");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
