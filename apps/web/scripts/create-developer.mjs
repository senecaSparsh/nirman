/**
 * create-developer.mjs — Creates a ghost DEVELOPER (god-mode) account.
 *
 * The developer account is:
 *   - role: DEVELOPER (tier 1, permissions: "*", full access)
 *   - isHidden: true (invisible in ALL user-facing UI)
 *   - No Employee record (not in HR/employee lists)
 *   - No CompanyPhone (not in call/telephony system)
 *   - No hierarchyLevel (not in org chart)
 *   - Not counted in peopleCount
 *
 * The account can log in via phone + password, see the feedback button,
 * view the feedback inbox, and access everything — but no other user
 * can see that this account exists.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  USAGE:
 *
 *    node apps/web/scripts/create-developer.mjs
 *
 *  ENV: reads DATABASE_URL from the environment.
 *
 *  ARGUMENTS (optional, override defaults):
 *    --phone=<10-digit>     Login phone number (default: 9999999999)
 *    --password=<string>    Login password (default: random 24-char)
 *    --name=<string>        Display name (default: "System Developer")
 *    --email=<string>       Email (default: phone-based internal)
 *    --company=<name>       Company name to attach to (default: first company)
 *
 *  The script is idempotent — safe to re-run. If the developer account
 *  already exists (matched by phone), it updates the password and
 *  ensures isHidden + role are correct, then exits.
 * ──────────────────────────────────────────────────────────────────────
 */
import { randomBytes, scrypt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

function normalizePhone10(input) {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function formatPhoneDisplay(phone10) {
  return `+91 ${phone10.slice(0, 5)} ${phone10.slice(5)}`;
}

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

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(24);
  let pw = "";
  for (let i = 0; i < 24; i++) pw += chars[bytes[i] % chars.length];
  return pw;
}

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const args = parseArgs();
  const phone = normalizePhone10(args.phone ?? "9999999999");
  const phoneDisplay = formatPhoneDisplay(phone);
  const name = args.name ?? "System Developer";
  const email = args.email ?? `dev+${phone}@nirman.internal`;
  const companyName = args.company;

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  GHOST DEVELOPER ACCOUNT CREATION");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Phone:   ${phoneDisplay}`);
  console.log(`  Name:    ${name}`);
  console.log(`  Email:   ${email}`);
  console.log(`  Date:    ${new Date().toISOString()}`);
  console.log("");

  // ── 1. Find or create the developer User ──
  let user = await prisma.user.findFirst({
    where: { phoneNormalized: phone },
    select: { id: true, name: true, email: true, role: true, isHidden: true },
  });

  let password = null;
  let userStatus = "EXISTING";

  if (!user) {
    password = args.password ?? generatePassword();
    user = await prisma.user.create({
      data: {
        email,
        name,
        role: "DEVELOPER",
        phone: phoneDisplay,
        phoneNormalized: phone,
        emailVerified: true,
        mustChangePassword: false,
        isHidden: true,
      },
      select: { id: true, name: true, email: true, role: true, isHidden: true },
    });
    userStatus = "CREATED";
    console.log(`  User: CREATED (id: ${user.id})`);
  } else {
    console.log(`  User: FOUND (id: ${user.id}) — ensuring isHidden + DEVELOPER role`);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: "DEVELOPER",
        isHidden: true,
        name,
        email,
      },
    });
  }

  // ── 2. Find or create credential Account ──
  let account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
    select: { id: true },
  });

  if (!account) {
    const pwToHash = password ?? generatePassword();
    if (!password) password = pwToHash;
    const hashed = await hashPassword(pwToHash);
    account = await prisma.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hashed,
      },
    });
    console.log(`  Account: CREATED (credential, password set)`);
  } else if (args.password || password) {
    // Reset password if explicitly provided or new user
    const pwToHash = password ?? args.password;
    const hashed = await hashPassword(pwToHash);
    await prisma.account.update({
      where: { id: account.id },
      data: { password: hashed },
    });
    console.log(`  Account: FOUND — password ${password ? "set" : "updated"}`);
  } else {
    console.log(`  Account: FOUND (password unchanged)`);
  }

  // ── 3. Attach to company (if specified or first available) ──
  let company = null;
  if (companyName) {
    company = await prisma.company.findFirst({
      where: { name: companyName, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!company) {
      console.log(`  WARNING: Company "${companyName}" not found. Developer will have no company membership.`);
    }
  } else {
    // Attach to the first non-deleted company
    company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
  }

  if (company) {
    let membership = await prisma.userCompany.findFirst({
      where: { userId: user.id, companyId: company.id },
      select: { id: true, role: true },
    });

    if (!membership) {
      membership = await prisma.userCompany.create({
        data: {
          userId: user.id,
          companyId: company.id,
          role: "DEVELOPER",
          scopeType: "COMPANY",
        },
        select: { id: true, role: true },
      });
      console.log(`  Membership: CREATED for "${company.name}" (role: DEVELOPER)`);
    } else {
      await prisma.userCompany.update({
        where: { id: membership.id },
        data: { role: "DEVELOPER", scopeType: "COMPANY" },
      });
      console.log(`  Membership: FOUND for "${company.name}" — role set to DEVELOPER`);
    }
  } else {
    console.log(`  No company found — developer account has no company membership.`);
  }

  // ── 4. Remove any Employee record (ghost = not in HR) ──
  const employee = await prisma.employee.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });
  if (employee) {
    await prisma.employee.delete({ where: { id: employee.id } });
    console.log(`  Employee record: DELETED (ghost account should not be in HR)`);
  } else {
    console.log(`  Employee record: NONE (good — ghost account)`);
  }

  // ── 5. Remove any CompanyPhone assignment ──
  const companyPhone = await prisma.companyPhone.findFirst({
    where: { assignedToUserId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (companyPhone) {
    await prisma.companyPhone.update({
      where: { id: companyPhone.id },
      data: { assignedToUserId: null, status: "UNASSIGNED" },
    });
    console.log(`  CompanyPhone: UNASSIGNED (ghost account should not be in call system)`);
  } else {
    console.log(`  CompanyPhone: NONE (good — ghost account)`);
  }

  // ── Summary ──
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  GHOST DEVELOPER ACCOUNT READY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Status:     ${userStatus}`);
  console.log(`  User ID:    ${user.id}`);
  console.log(`  Role:       DEVELOPER (god-mode, tier 1)`);
  console.log(`  isHidden:   true (invisible in all UI)`);
  console.log(`  Login:      phone ${phoneDisplay}`);
  if (password) {
    console.log(`  Password:   ${password}`);
    console.log(`  ⚠️  Copy this password now — it will not be shown again.`);
  } else {
    console.log(`  Password:   (unchanged from previous run)`);
  }
  console.log("═══════════════════════════════════════════════════════════════");
}

main()
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
