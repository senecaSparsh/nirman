/**
 * One-time backfill: populate User.phoneNormalized for existing users
 * who have a phone number but no phoneNormalized value.
 *
 * Run with: npx tsx apps/web/scripts/backfill-phone-normalized.ts
 */
import { prisma } from "@nirman/db";

function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

async function main() {
  const users = await prisma.user.findMany({
    where: {
      phone: { not: null },
      phoneNormalized: null,
    },
    select: { id: true, phone: true },
  });

  console.log(`Found ${users.length} users to backfill.`);

  let updated = 0;
  for (const u of users) {
    const normalized = normalizePhone(u.phone ?? "");
    if (normalized.length >= 10) {
      await prisma.user.update({
        where: { id: u.id },
        data: { phoneNormalized: normalized },
      });
      updated++;
    }
  }

  console.log(`Backfilled ${updated} users with phoneNormalized.`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
