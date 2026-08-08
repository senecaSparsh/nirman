// One-off: set a known password on all seed users so the Playwright crawl can log in.
// Uses the EXACT same library Better-Auth uses (@noble/hashes/scrypt) to guarantee compatibility.
import { scryptAsync } from "../node_modules/.pnpm/@noble+hashes@2.2.0/node_modules/@noble/hashes/scrypt.js";
import { hex } from "../node_modules/.pnpm/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/hex.mjs";
import { randomBytes, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";

const CONFIG = { N: 16384, r: 16, p: 1, dkLen: 64 };
const PASSWORD = "Crawl123!";

async function hashPassword(password) {
  const salt = hex.encode(randomBytes(16));
  const key = await scryptAsync(password.normalize("NFKC"), salt, CONFIG);
  return `${salt}:${hex.encode(key)}`;
}

async function main() {
  const users = execSync(`psql -d nirman_inventory -t -A -c 'SELECT id, email FROM "User";'`, { encoding: "utf-8" })
    .trim().split("\n").map((l) => { const [id, ...emailParts] = l.split("|"); return { id, email: emailParts.join("|") }; });

  // Clear any existing accounts first
  execSync(`psql -d nirman_inventory -c 'DELETE FROM "Account";'`);

  for (const u of users) {
    const hash = await hashPassword(PASSWORD);
    const safeHash = hash.replace(/'/g, "''");
    const id = randomUUID();
    execSync(`psql -d nirman_inventory -c 'INSERT INTO "Account" (id, "providerId", "accountId", "userId", password, "createdAt", "updatedAt") VALUES ('"'"'${id}'"'"', '"'"'credential'"'"', '"'"'${u.id}'"'"', '"'"'${u.id}'"'"', '"'"'${safeHash}'"'"', NOW(), NOW());'`);
    console.log(`  set password for ${u.email}`);
  }
  console.log(`\nDone. Password for all users: ${PASSWORD}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
