/**
 * local-reset-srg.mjs — LOCAL DEV ONLY. Wipes ALL data from the database
 * and creates the 7 SRG REALCON team member accounts with a shared dev
 * password ("nirman123") so the one-click quick-login buttons work
 * seamlessly.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  WHAT THIS SCRIPT DOES:
 *
 *  1. TRUNCATES every table in the public schema (CASCADE) — all data is
 *     gone: companies, users, projects, stock, sales, etc. This is a
 *     full reset. Use only on a local dev database.
 *  2. Creates the "SRG REALCON" company.
 *  3. Creates 7 users with RBAC roles + phone-based login (phoneNormalized).
 *  4. Creates 7 UserCompany memberships with reportsTo hierarchy wiring.
 *  5. Creates 7 credential Accounts (scrypt-hashed, shared password
 *     "nirman123" — same as the demo-login endpoint).
 *  6. Creates 7 Employee records with hierarchyLevel (H1–H4).
 *  7. Creates 7 CompanyPhone records + 7 PhoneAssignment records.
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
 *  PASSWORD: "nirman123" for ALL accounts (shared dev password — matches
 *  the demo-login endpoint so quick-login buttons just work).
 *
 *  USAGE:
 *    node apps/web/scripts/local-reset-srg.mjs
 *
 *  The script reads DATABASE_URL from the environment (or .env file).
 *  It is NOT wired into docker-entrypoint.sh — this is for local dev only.
 *
 * ──────────────────────────────────────────────────────────────────────
 */
import { scrypt, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ── Resolve the Prisma client path ──
const __dirname = dirname(fileURLToPath(import.meta.url));
const PRISMA_CLIENT_PATH = join(__dirname, "..", "..", "..", "packages", "db", "src", "generated", "prisma", "index.js");

const { PrismaClient } = await import(PRISMA_CLIENT_PATH);
const prisma = new PrismaClient({
  log: ["error"],
  transactionOptions: { maxWait: 10_000, timeout: 30_000 },
});

// ═══════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const COMPANY_NAME = "SRG REALCON";
const SHARED_PASSWORD = "nirman123"; // matches demo-login endpoint

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
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════

function normalizePhone10(input) {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function normalizePhone12(input) {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 11 && digits.startsWith("0")) digits = "91" + digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 13 && digits.startsWith("910")) digits = "91" + digits.slice(3);
  return digits;
}

function formatPhoneDisplay(phone10) {
  return `+91 ${phone10.slice(0, 5)} ${phone10.slice(5)}`;
}

/**
 * Scrypt-hash a password using the SAME parameters as Better-Auth.
 * Format: "salt:hash" (both hex). N=16384, r=16, p=1, dkLen=64.
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

// ═══════════════════════════════════════════════════════════════════════
//  WIPE — truncate all tables in the public schema
// ═══════════════════════════════════════════════════════════════════════

async function wipeAllData() {
  console.log("── Step 0: Wiping ALL data ─────────────────────────────");
  // Get all table names in the public schema, excluding Prisma's migration
  // table (we keep migrations so `prisma migrate status` still works).
  const tables = await prisma.$queryRawUnsafe(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename != '_prisma_migrations'
    ORDER BY tablename;
  `);
  const tableNames = tables.map((t) => `"${t.tablename}"`);
  if (tableNames.length === 0) {
    console.log("  No tables found — nothing to wipe.");
    return;
  }
  // TRUNCATE all tables with CASCADE — drops all data, resets sequences.
  // Using a single TRUNCATE statement is atomic and handles FK constraints.
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableNames.join(", ")} RESTART IDENTITY CASCADE;`,
  );
  console.log(`  Truncated ${tableNames.length} tables.`);
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SRG REALCON — LOCAL DEV RESET + SEED");
  console.log("  ⚠️  THIS WIPES ALL DATA — LOCAL DEV ONLY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Database: ${process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? "(from env)"}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log("");

  // ── 0. Wipe all data ──
  await wipeAllData();
  console.log("");

  // ── 1. Create the parent company ──
  console.log("── Step 1: Company ──────────────────────────────────────");
  const company = await prisma.company.create({
    data: {
      name: COMPANY_NAME,
      businessType: "Real Estate Development",
      currency: "INR",
    },
  });
  console.log(`  CREATED: ${company.name} (id: ${company.id})`);
  const companyId = company.id;

  // ── 2. Create users (H1 first, then H2, H3, H4) ──
  console.log("");
  console.log("── Step 2: Users + Memberships + Accounts + Employees + Phones ──");

  const userCompanyIds = {}; // key → UserCompany.id (for reportsTo wiring)
  const hashedPassword = await hashPassword(SHARED_PASSWORD);

  for (const u of USERS) {
    const phone10 = normalizePhone10(u.phone);
    const phone12 = normalizePhone12(u.phone);
    const phoneDisplay = formatPhoneDisplay(phone10);
    const email = `phone+${phone12}@nirman.internal`;

    console.log(`\n  [${u.key}] ${u.name} (${u.role}, H${u.hierarchyLevel}) — ${phoneDisplay}`);

    // ── 2a. Create User ──
    const user = await prisma.user.create({
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
    console.log(`    User: CREATED (id: ${user.id})`);

    // ── 2b. Create UserCompany membership ──
    const membership = await prisma.userCompany.create({
      data: {
        userId: user.id,
        companyId,
        role: u.role,
      },
      select: { id: true, role: true },
    });
    console.log(`    Membership: CREATED (id: ${membership.id}, role: ${u.role})`);
    userCompanyIds[u.key] = membership.id;

    // ── 2c. Create credential Account (shared dev password) ──
    const account = await prisma.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hashedPassword,
      },
    });
    console.log(`    Account: CREATED (credential, password: ${SHARED_PASSWORD})`);

    // ── 2d. Create Employee record with hierarchyLevel ──
    const employee = await prisma.employee.create({
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

    // ── 2e. Create CompanyPhone ──
    const companyPhone = await prisma.companyPhone.create({
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

    // ── 2f. Create PhoneAssignment history record ──
    await prisma.phoneAssignment.create({
      data: {
        companyPhoneId: companyPhone.id,
        userId: user.id,
        reason: "Assigned during account creation",
      },
    });
    console.log(`    PhoneAssignment: CREATED`);
  }

  // ── 3. Wire reportsTo hierarchy ──
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
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  LOCAL DEV SEED COMPLETE");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log(`  Company: ${COMPANY_NAME} (id: ${companyId})`);
  console.log(`  Password (ALL accounts): ${SHARED_PASSWORD}`);
  console.log("");
  console.log("  ┌──────────────────┬────────────────────────┬───────┬────────────┐");
  console.log("  │ Name             │ Role                   │ H-Lvl │ Phone      │");
  console.log("  ├──────────────────┼────────────────────────┼───────┼────────────┤");
  for (const u of USERS) {
    const phone10 = normalizePhone10(u.phone);
    const namePad = u.name.padEnd(16);
    const rolePad = u.role.padEnd(22);
    const hPad = `H${u.hierarchyLevel}`.padEnd(5);
    const phonePad = phone10.padEnd(10);
    console.log(`  │ ${namePad} │ ${rolePad} │ ${hPad} │ ${phonePad} │`);
  }
  console.log("  └──────────────────┴────────────────────────┴───────┴────────────┘");
  console.log("");
  console.log("  LOGIN:");
  console.log("    • Phone mode: enter the 10-digit phone + password 'nirman123'");
  console.log("    • Quick login: click the team member button on the sign-in page");
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
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
