import { prisma } from "@nirman/db";
// Restore rohan's role (B2 garbage PATCH set him to SUPERVISOR)
await prisma.userCompany.update({ where: { userId_companyId: { userId: "cmu71ujzx0005vleq9qjtot5p", companyId: "cmu1990sa0000vlpqpegbainb" } }, data: { role: "SITE_ENGINEER" } });
await prisma.user.update({ where: { id: "cmu71ujzx0005vleq9qjtot5p" }, data: { role: "SITE_ENGINEER" } });
// Restore owner's membership (D3 deleted it)
const m = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: "cmu1990sf0002vlpqw5kcsgpa", companyId: "cmu1990sa0000vlpqpegbainb" } } });
if (!m) {
  await prisma.userCompany.create({ data: { userId: "cmu1990sf0002vlpqw5kcsgpa", companyId: "cmu1990sa0000vlpqpegbainb", role: "OWNER" } });
  console.log("owner membership recreated");
} else { console.log("owner membership already present:", m.role); }
// Remove leftover test member if any
const t = await prisma.user.findUnique({ where: { email: "member.test@nirman.internal" } });
if (t) { await prisma.userCompany.deleteMany({ where: { userId: t.id } }); await prisma.user.delete({ where: { id: t.id } }); }
console.log("rohan restored to SITE_ENGINEER");
await prisma.$disconnect();
