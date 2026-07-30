/**
 * Seed script — bootstraps a demo company, material categories, materials,
 * stock locations, and a small amount of stock so the Materials module is
 * immediately explorable after `pnpm db:push`.
 *
 * Run with: pnpm --filter @nirman/db seed
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // 1. Company (singleton for now)
  const company =
    (await prisma.company.findFirst({ where: { deletedAt: null } })) ??
    (await prisma.company.create({
      data: { name: "Nirman Constructions", currency: "INR" },
    }));

  // 2. A demo project + its site location
  const project =
    (await prisma.project.findFirst({ where: { companyId: company.id } })) ??
    (await prisma.project.create({
      data: {
        companyId: company.id,
        name: "Greenfield Residency",
        type: "RESIDENTIAL",
        status: "ACTIVE",
        address: "Sector 21, Pune",
      },
    }));

  // 3. Stock locations
  const warehouse =
    (await prisma.stockLocation.findFirst({
      where: { companyId: company.id, type: "COMPANY_WAREHOUSE" },
    })) ??
    (await prisma.stockLocation.create({
      data: {
        companyId: company.id,
        type: "COMPANY_WAREHOUSE",
        name: "Central Warehouse",
        address: "Plot 14, MIDC, Pune",
      },
    }));

  const site =
    (await prisma.stockLocation.findFirst({
      where: { companyId: company.id, projectId: project.id },
    })) ??
    (await prisma.stockLocation.create({
      data: {
        companyId: company.id,
        type: "PROJECT_SITE",
        projectId: project.id,
        name: "Greenfield Site Yard",
      },
    }));

  // 4. Material categories
  const categories = [
    { name: "Cement & Binding", unit: "BAG" },
    { name: "Steel & Rebar", unit: "KG" },
    { name: "Bricks & Blocks", unit: "NOS" },
    { name: "Electrical", unit: "NOS" },
    { name: "Paint & Finishes", unit: "LTR" },
  ];
  const catMap: Record<string, string> = {};
  for (const c of categories) {
    const existing = await prisma.materialCategory.findUnique({ where: { name: c.name } });
    const row = existing ?? (await prisma.materialCategory.create({ data: c }));
    catMap[c.name] = row.id;
  }

  // 5. Materials
  const materials = [
    { code: "CEM-OPC53", name: "Cement OPC 53 Grade", categoryId: catMap["Cement & Binding"], unit: "BAG", standardCost: 380, gstRate: 28, minStock: 200, hsnCode: "25232900" },
    { code: "CEM-PPC", name: "Cement PPC", categoryId: catMap["Cement & Binding"], unit: "BAG", standardCost: 340, gstRate: 28, minStock: 200, hsnCode: "25232900" },
    { code: "STL-TMT12", name: "TMT Steel Rebar 12mm", categoryId: catMap["Steel & Rebar"], unit: "KG", standardCost: 78, gstRate: 18, minStock: 5000, hsnCode: "72142090" },
    { code: "STL-TMT16", name: "TMT Steel Rebar 16mm", categoryId: catMap["Steel & Rebar"], unit: "KG", standardCost: 80, gstRate: 18, minStock: 3000, hsnCode: "72142090" },
    { code: "BRK-RED", name: "Red Clay Brick", categoryId: catMap["Bricks & Blocks"], unit: "NOS", standardCost: 7, gstRate: 5, minStock: 20000 },
    { code: "BLK-AAC", name: "AAC Block 600x200x150", categoryId: catMap["Bricks & Blocks"], unit: "NOS", standardCost: 45, gstRate: 18, minStock: 5000 },
    { code: "ELC-WIRE25", name: "Electrical Wire 2.5sqmm", categoryId: catMap["Electrical"], unit: "MTR", standardCost: 18, gstRate: 18, minStock: 2000 },
    { code: "PNT-ACPRM", name: "Acrylic Primer", categoryId: catMap["Paint & Finishes"], unit: "LTR", standardCost: 120, gstRate: 18, minStock: 150 },
  ];
  const matMap: Record<string, string> = {};
  for (const m of materials) {
    const existing = await prisma.material.findUnique({ where: { code: m.code } });
    const row = existing ?? (await prisma.material.create({ data: m as any }));
    matMap[m.code] = row.id;
  }

  // 6. Some stock at the warehouse (direct StockLocationItem + a receipt-style movement)
  const stock = [
    { code: "CEM-OPC53", loc: warehouse.id, qty: 1200, mac: 380 },
    { code: "CEM-PPC", loc: warehouse.id, qty: 80, mac: 340 }, // below minStock (200)
    { code: "STL-TMT12", loc: warehouse.id, qty: 8200, mac: 78 },
    { code: "STL-TMT16", loc: warehouse.id, qty: 1500, mac: 80 }, // below minStock (3000)
    { code: "BRK-RED", loc: site.id, qty: 45000, mac: 7 },
    { code: "BLK-AAC", loc: site.id, qty: 3200, mac: 45 }, // below minStock (5000)
    { code: "ELC-WIRE25", loc: warehouse.id, qty: 1800, mac: 18 }, // below minStock (2000)
    { code: "PNT-ACPRM", loc: warehouse.id, qty: 220, mac: 120 },
  ];
  for (const s of stock) {
    const materialId = matMap[s.code];
    if (!materialId) continue;
    await prisma.stockLocationItem.upsert({
      where: { locationId_materialId: { locationId: s.loc, materialId } },
      create: { locationId: s.loc, materialId, qty: s.qty, movingAvgCost: s.mac },
      update: { qty: s.qty, movingAvgCost: s.mac },
    });
    await prisma.stockMovement.create({
      data: {
        materialId,
        movementType: "PURCHASE_RECEIPT",
        toLocationId: s.loc,
        qty: s.qty,
        unitCost: s.mac,
        balanceAfter: s.qty,
        balanceValueAfter: s.qty * s.mac,
        reason: "Seed opening stock",
        refType: "SEED",
      },
    });
  }

  console.log("Seed complete.");
  console.log(`  Company: ${company.name} (${company.id})`);
  console.log(`  Project: ${project.name} (${project.id})`);
  console.log(`  Locations: ${warehouse.name}, ${site.name}`);
  console.log(`  Materials: ${materials.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
