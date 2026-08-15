/**
 * POST /api/assistant
 *
 * Owner Assistant ("Sahayak") — takes natural language text (English,
 * Hindi, Hinglish), parses intent, executes the corresponding action
 * via direct DB queries, and returns a structured response with a
 * human-readable message + optional action cards.
 *
 * The assistant is read-heavy: most intents are queries (stock, sales,
 * approvals, cash, etc.). Write intents (approve PO, create sale) are
 * supported but require confirmation from the user via action cards.
 */
import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import {
  lowStockAlerts,
  getCompanyPortfolioSummary,
  trialBalance,
} from "@nirman/services";
import { apiHandler, json, requireUser, getCompany, toNum } from "@/lib/server";
import { parseIntent, type Intent } from "@/lib/assistant/nlu";
import { formatCurrency, formatNumber } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ActionCard {
  type: "link" | "button" | "confirm";
  label: string;
  href?: string;
  endpoint?: string;
  method?: string;
  body?: Record<string, unknown>;
  variant?: "primary" | "secondary" | "danger";
}

interface AssistantResponse {
  text: string;
  cards?: ActionCard[];
  intent: Intent;
  confidence: number;
}

interface ParsedEntities {
  number?: number;
  poNumber?: string;
  reqNumber?: string;
  materialName?: string;
  projectName?: string;
  amount?: number;
  action?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const company = await getCompany();

  const body = await req.json();
  const text: string = (body?.text ?? "").trim();
  if (!text) {
    return json({ error: "Text is required" }, { status: 400 });
  }

  const parsed = parseIntent(text);
  const response = await executeIntent(parsed.intent, parsed.entities, company.id, text);

  return json({
    ...response,
    intent: parsed.intent,
    confidence: parsed.confidence,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTENT EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════

async function executeIntent(
  intent: Intent,
  entities: ParsedEntities,
  companyId: string,
  rawText: string,
): Promise<AssistantResponse> {
  switch (intent) {
    case "GREETING":
      return greetingResponse();
    case "HELP":
      return helpResponse();
    case "STOCK_QUERY":
      return stockQueryResponse(companyId, entities);
    case "LOW_STOCK":
      return lowStockResponse(companyId);
    case "APPROVALS_LIST":
      return approvalsListResponse(companyId);
    case "APPROVE_PO":
      return approvePoResponse(companyId, entities);
    case "APPROVE_REQUISITION":
      return approveReqResponse(companyId, entities);
    case "REJECT_PO":
      return rejectPoResponse(companyId, entities);
    case "REJECT_REQUISITION":
      return rejectReqResponse(companyId, entities);
    case "SALES_LIST":
      return salesListResponse(companyId);
    case "SALE_CREATE":
      return saleCreateResponse();
    case "PAYMENT_STATUS":
      return paymentStatusResponse(companyId);
    case "PROJECT_STATUS":
    case "PROJECT_LIST":
      return projectListResponse(companyId);
    case "CASH_POSITION":
      return cashPositionResponse(companyId);
    case "SUPPLIER_PAYABLE":
      return supplierPayableResponse(companyId);
    case "SUPPLIER_LIST":
      return supplierListResponse(companyId);
    case "ATTENDANCE_TODAY":
      return attendanceResponse(companyId);
    case "CREATE_PO":
      return createPoResponse();
    case "CREATE_REQUISITION":
      return createReqResponse();
    case "AUTO_REQUISITION":
      return autoReqResponse();
    case "DPR_LIST":
      return dprListResponse(companyId);
    case "TRIAL_BALANCE":
      return trialBalanceResponse(companyId);
    case "EQUIPMENT_STATUS":
      return equipmentResponse(companyId);
    case "EXPENSE_LIST":
      return expenseResponse(companyId);
    case "TASK_LIST":
      return taskResponse(companyId);
    case "WORKER_LIST":
      return workerListResponse(companyId);
    case "ATTENTION":
      return attentionResponse(companyId);
    case "MONTHLY_SUMMARY":
      return monthlySummaryResponse(companyId);
    case "PROFIT_LOSS":
      return profitLossResponse(companyId);
    case "SPEND_ANALYSIS":
      return spendAnalysisResponse(companyId, entities);
    case "APPROVE_ALL":
      return approveAllResponse(companyId);
    case "SUPPLIER_PAYMENT":
      return supplierPaymentResponse(companyId);
    default:
      return unknownResponse(rawText);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function greetingResponse(): AssistantResponse {
  const greetings = [
    "Namaste! 👋 Main Sahayak hoon. Bataiye, kya help karu?",
    "Hello! Kya jaanna ya karna hai? Type karo ya bol lo 🎤",
    "Namaste! Aapka assistant ready hai. Stock, sales, approvals — sab kuch poochho.",
  ];
  return {
    text: greetings[Math.floor(Math.random() * greetings.length)] ?? greetings[0]!,
    intent: "GREETING",
    confidence: 1,
    cards: [
      { type: "link", label: "Stock dekho", href: "/m/materials" },
      { type: "link", label: "Approvals", href: "/m/pulse/approvals" },
    ],
  };
}

function helpResponse(): AssistantResponse {
  return {
    text: `Main ye sab kar sakta hoon:

� **Stock & Inventory**
• "Stock kya hai?" — current stock
• "Low stock kya hai?" — kya khatam ho raha
• "Cement kitna hai?" — specific material
• "Pachaas hazaar ka cement" — Hindi numbers!

✅ **Approvals**
• "Approvals pending?" — pending list
• "PO-0011 approve kar" — specific PO
• "Sab approve kar" — approve all
• "Pehla wala approve kar" — by position

💰 **Sales & Payment**
• "Aaj ki sales" — recent sales
• "Payment kitni baki?" — pending payments
• "Naya sale banao" — create sale

🏗️ **Projects & Reports**
• "Project status" — all projects
• "DPR pending" — daily reports
• "Is mahine ka summary" — monthly summary
• "Profit kitna hua?" — P&L
• "Cement par kitna kharcha?" — spend analysis

💵 **Finance**
• "Cash position" — cash & bank
• "Trial balance" — GL summary
• "Supplier ko kitna dena?" — payables
• "Supplier ko pay karo" — make payment

👷 **Site & Workers**
• "Aaj kitne worker aaye?" — attendance
• "Auto requisition chala" — auto-generate
• "Kya karna hai?" — what needs attention

Bolo ya type karo — Hindi, English, ya dono! 🎤`,
    intent: "HELP",
    confidence: 1,
  };
}

async function stockQueryResponse(companyId: string, entities: ParsedEntities): Promise<AssistantResponse> {
  // If a specific material is mentioned, query that
  if (entities.materialName) {
    const materials = await prisma.material.findMany({
      where: {
        deletedAt: null,
        name: { contains: entities.materialName, mode: "insensitive" },
        stockItems: { some: { location: { companyId, deletedAt: null } } },
      },
      include: {
        stockItems: { include: { location: true } },
      },
      take: 5,
    });

    if (materials.length === 0) {
      return {
        text: `"${entities.materialName}" nahi mila. Kya naam exactly hai?`,
        intent: "STOCK_QUERY",
        confidence: 0.8,
        cards: [{ type: "link", label: "All materials", href: "/m/materials" }],
      };
    }

    let text = `📦 **${entities.materialName.toUpperCase()}** stock:\n\n`;
    for (const m of materials.slice(0, 3)) {
      const totalQty = m.stockItems.reduce((s, si) => s + toNum(si.qty), 0);
      text += `• ${m.name} (${m.code}): ${formatNumber(totalQty, 2)} ${m.unit}\n`;
      for (const si of m.stockItems.slice(0, 2)) {
        text += `   ↳ ${si.location.name}: ${formatNumber(toNum(si.qty), 2)} ${m.unit}\n`;
      }
    }
    return {
      text,
      intent: "STOCK_QUERY",
      confidence: 0.9,
      cards: [{ type: "link", label: "Full inventory", href: "/m/materials" }],
    };
  }

  // General stock summary — top items by qty across company locations
  const stockItems = await prisma.stockLocationItem.findMany({
    where: { location: { companyId, deletedAt: null }, qty: { gt: 0 } },
    include: { material: true, location: true },
    orderBy: { qty: "desc" },
    take: 10,
  });

  const totalValue = stockItems.reduce(
    (s, si) => s + toNum(si.qty) * toNum(si.movingAvgCost),
    0,
  );

  const locations = await prisma.stockLocation.count({
    where: { companyId, deletedAt: null },
  });

  let text = `📦 **Stock Summary**\n`;
  text += `${locations} locations | Top ${stockItems.length} items:\n\n`;
  for (const si of stockItems.slice(0, 8)) {
    text += `• ${si.material.name}: ${formatNumber(toNum(si.qty), 2)} ${si.material.unit} @ ${formatCurrency(toNum(si.movingAvgCost))}/${si.material.unit}\n`;
    text += `   📍 ${si.location.name}\n`;
  }
  text += `\n💰 Total stock value (top 10): ${formatCurrency(totalValue)}`;

  return {
    text,
    intent: "STOCK_QUERY",
    confidence: 0.9,
    cards: [
      { type: "link", label: "Full inventory", href: "/m/materials" },
      { type: "link", label: "Stock movements", href: "/m/stock-movements" },
    ],
  };
}

async function lowStockResponse(companyId: string): Promise<AssistantResponse> {
  const alerts = await lowStockAlerts(companyId).catch(() => []);

  if (alerts.length === 0) {
    return {
      text: "✅ Sab kuch sufficient hai! Koi material low stock par nahi hai.",
      intent: "LOW_STOCK",
      confidence: 0.9,
      cards: [{ type: "link", label: "Inventory", href: "/m/materials" }],
    };
  }

  let text = `⚠️ **${alerts.length} materials low stock par hain:**\n\n`;
  for (const a of alerts.slice(0, 8)) {
    text += `• ${a.name} (${a.code}): ${formatNumber(toNum(a.totalStock), 2)} ${a.unit} left (reorder: ${formatNumber(toNum(a.reorderPoint), 2)})\n`;
  }
  if (alerts.length > 8) text += `\n...aur ${alerts.length - 8} more`;

  return {
    text,
    intent: "LOW_STOCK",
    confidence: 0.9,
    cards: [
      { type: "link", label: "Reorder now", href: "/m/requisitions" },
      { type: "button", label: "Auto-generate requisition", endpoint: "/api/requisitions/auto", method: "POST", variant: "primary" },
    ],
  };
}

async function approvalsListResponse(companyId: string): Promise<AssistantResponse> {
  const [draftPOs, pendingReqs] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { companyId, status: "DRAFT" },
      include: { supplier: true, _count: { select: { lines: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.materialRequisition.findMany({
      where: { project: { companyId }, status: "SUBMITTED" },
      include: { project: true, _count: { select: { lines: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  let text = `📋 **Pending Approvals:**\n\n`;

  if (draftPOs.length > 0) {
    text += `**Purchase Orders (${draftPOs.length}):**\n`;
    for (const po of draftPOs.slice(0, 5)) {
      text += `• ${po.poNumber} — ${po.supplier.name} | ${formatCurrency(toNum(po.total))} | ${po._count.lines} items\n`;
    }
    if (draftPOs.length > 5) text += `...aur ${draftPOs.length - 5} more\n`;
    text += `\n`;
  }

  if (pendingReqs.length > 0) {
    text += `**Requisitions (${pendingReqs.length}):**\n`;
    for (const r of pendingReqs.slice(0, 5)) {
      text += `• ${r.reqNumber} — ${r.project?.name ?? "Unknown"} | ${r._count.lines} items\n`;
    }
    if (pendingReqs.length > 5) text += `...aur ${pendingReqs.length - 5} more\n`;
  }

  if (draftPOs.length === 0 && pendingReqs.length === 0) {
    text = "✅ Koi pending approval nahi hai! Sab clear hai. 🎉";
  }

  const cards: ActionCard[] = [];
  if (draftPOs.length > 0 || pendingReqs.length > 0) {
    cards.push({ type: "link", label: "Go to approvals", href: "/m/pulse/approvals", variant: "primary" });
  }

  return { text, cards, intent: "APPROVALS_LIST", confidence: 0.9 };
}

async function approvePoResponse(companyId: string, entities: ParsedEntities): Promise<AssistantResponse> {
  if (!entities.poNumber) {
    const draftPOs = await prisma.purchaseOrder.findMany({
      where: { companyId, status: "DRAFT" },
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (draftPOs.length === 0) {
      return { text: "Koi draft PO nahi hai approve karne ke liye.", intent: "APPROVE_PO", confidence: 0.8 };
    }

    const text = `Kaunsa PO approve karna hai?\n\n`;
    const cards: ActionCard[] = draftPOs.slice(0, 5).map((po) => ({
      type: "confirm" as const,
      label: `✅ ${po.poNumber} — ${po.supplier.name} (${formatCurrency(toNum(po.total))})`,
      endpoint: `/api/purchase-orders/${po.id}`,
      method: "PATCH",
      body: { action: "approve" },
      variant: "primary" as const,
    }));

    return { text, cards, intent: "APPROVE_PO", confidence: 0.8 };
  }

  const po = await prisma.purchaseOrder.findFirst({
    where: { companyId, poNumber: { contains: entities.poNumber.replace("PO-", ""), mode: "insensitive" } },
    include: { supplier: true },
  });

  if (!po) {
    return { text: `PO "${entities.poNumber}" nahi mila. Sahi number dijiye.`, intent: "APPROVE_PO", confidence: 0.7 };
  }

  if (po.status !== "DRAFT") {
    return { text: `${po.poNumber} already ${po.status} hai. Approve nahi kar sakte.`, intent: "APPROVE_PO", confidence: 0.7 };
  }

  return {
    text: `**${po.poNumber}** approve karna hai?\n\nSupplier: ${po.supplier.name}\nTotal: ${formatCurrency(toNum(po.total))}\n\nConfirm karein:`,
    intent: "APPROVE_PO",
    confidence: 0.9,
    cards: [
      {
        type: "confirm",
        label: `✅ Approve ${po.poNumber}`,
        endpoint: `/api/purchase-orders/${po.id}`,
        method: "PATCH",
        body: { action: "approve" },
        variant: "primary",
      },
    ],
  };
}

async function approveReqResponse(companyId: string, entities: ParsedEntities): Promise<AssistantResponse> {
  if (!entities.reqNumber) {
    const pendingReqs = await prisma.materialRequisition.findMany({
      where: { project: { companyId }, status: "SUBMITTED" },
      include: { project: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (pendingReqs.length === 0) {
      return { text: "Koi pending requisition nahi hai.", intent: "APPROVE_REQUISITION", confidence: 0.8 };
    }

    const text = `Kaunsi requisition approve karni hai?\n\n`;
    const cards: ActionCard[] = pendingReqs.slice(0, 5).map((r) => ({
      type: "confirm" as const,
      label: `✅ ${r.reqNumber} — ${r.project?.name ?? "Unknown"}`,
      endpoint: `/api/requisitions/${r.id}`,
      method: "PATCH",
      body: { action: "approve" },
      variant: "primary" as const,
    }));

    return { text, cards, intent: "APPROVE_REQUISITION", confidence: 0.8 };
  }

  const req = await prisma.materialRequisition.findFirst({
    where: { reqNumber: { contains: entities.reqNumber.replace("REQ-", ""), mode: "insensitive" } },
    include: { project: true },
  });

  if (!req) {
    return { text: `Requisition "${entities.reqNumber}" nahi mili.`, intent: "APPROVE_REQUISITION", confidence: 0.7 };
  }

  if (req.status !== "SUBMITTED") {
    return { text: `${req.reqNumber} already ${req.status} hai.`, intent: "APPROVE_REQUISITION", confidence: 0.7 };
  }

  return {
    text: `**${req.reqNumber}** approve karni hai?\n\nProject: ${req.project?.name ?? "Unknown"}\n\nConfirm karein:`,
    intent: "APPROVE_REQUISITION",
    confidence: 0.9,
    cards: [
      {
        type: "confirm",
        label: `✅ Approve ${req.reqNumber}`,
        endpoint: `/api/requisitions/${req.id}`,
        method: "PATCH",
        body: { action: "approve" },
        variant: "primary",
      },
    ],
  };
}

async function rejectPoResponse(companyId: string, entities: ParsedEntities): Promise<AssistantResponse> {
  if (!entities.poNumber) {
    return { text: "Kaunsa PO reject karna hai? PO number bataiye (jaise PO-0011).", intent: "REJECT_PO", confidence: 0.7 };
  }
  const po = await prisma.purchaseOrder.findFirst({
    where: { companyId, poNumber: { contains: entities.poNumber.replace("PO-", ""), mode: "insensitive" } },
  });
  if (!po) return { text: `PO "${entities.poNumber}" nahi mila.`, intent: "REJECT_PO", confidence: 0.7 };

  return {
    text: `**${po.poNumber}** reject karna hai? Ye action undo nahi hoga.`,
    intent: "REJECT_PO",
    confidence: 0.9,
    cards: [
      {
        type: "confirm",
        label: `❌ Reject ${po.poNumber}`,
        endpoint: `/api/purchase-orders/${po.id}`,
        method: "PATCH",
        body: { action: "cancel" },
        variant: "danger",
      },
    ],
  };
}

async function rejectReqResponse(companyId: string, entities: ParsedEntities): Promise<AssistantResponse> {
  if (!entities.reqNumber) {
    return { text: "Kaunsi requisition reject karni hai? Number bataiye.", intent: "REJECT_REQUISITION", confidence: 0.7 };
  }
  const req = await prisma.materialRequisition.findFirst({
    where: { reqNumber: { contains: entities.reqNumber.replace("REQ-", ""), mode: "insensitive" } },
  });
  if (!req) return { text: `Requisition "${entities.reqNumber}" nahi mili.`, intent: "REJECT_REQUISITION", confidence: 0.7 };

  return {
    text: `**${req.reqNumber}** reject karni hai?`,
    intent: "REJECT_REQUISITION",
    confidence: 0.9,
    cards: [
      {
        type: "confirm",
        label: `❌ Reject ${req.reqNumber}`,
        endpoint: `/api/requisitions/${req.id}`,
        method: "PATCH",
        body: { action: "reject" },
        variant: "danger",
      },
    ],
  };
}

async function salesListResponse(companyId: string): Promise<AssistantResponse> {
  const sales = await prisma.materialSale.findMany({
    where: { companyId },
    include: { customer: true, payments: { select: { amount: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (sales.length === 0) {
    return { text: "Abhi tak koi sale nahi hui. Pehli sale banaiye!", intent: "SALES_LIST", confidence: 0.8, cards: [{ type: "link", label: "New sale", href: "/m/sales/new", variant: "primary" }] };
  }

  const totalRevenue = sales.reduce((s, sale) => s + toNum(sale.totalAmount), 0);
  const paidAmount = sales.reduce(
    (s, sale) => s + sale.payments.reduce((ps, p) => ps + toNum(p.amount), 0),
    0,
  );
  const pending = totalRevenue - paidAmount;

  let text = `💰 **Recent Sales (${sales.length}):**\n\n`;
  for (const s of sales.slice(0, 6)) {
    const status = s.paymentStatus === "PAID" ? "✅" : s.paymentStatus === "PARTIAL" ? "⏳" : "❌";
    text += `${status} ${s.saleNumber} — ${s.customer?.name ?? "Walk-in"} | ${formatCurrency(toNum(s.totalAmount))} | ${s.paymentStatus}\n`;
  }
  text += `\n📊 Total: ${formatCurrency(totalRevenue)} | Collected: ${formatCurrency(paidAmount)} | Pending: ${formatCurrency(pending)}`;

  return {
    text,
    intent: "SALES_LIST",
    confidence: 0.9,
    cards: [
      { type: "link", label: "All sales", href: "/m/material-sales" },
      { type: "link", label: "New sale", href: "/m/sales/new", variant: "primary" },
    ],
  };
}

function saleCreateResponse(): AssistantResponse {
  return {
    text: `Nayi sale banani hai? Customer, material, aur quantity bataiye.\n\nYa direct form kholein:`,
    intent: "SALE_CREATE",
    confidence: 0.8,
    cards: [{ type: "link", label: "➕ New Sale Form", href: "/m/sales/new", variant: "primary" }],
  };
}

async function paymentStatusResponse(companyId: string): Promise<AssistantResponse> {
  const sales = await prisma.materialSale.findMany({
    where: { companyId, paymentStatus: { in: ["PENDING", "PARTIAL"] } },
    include: { customer: true, payments: { select: { amount: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  let totalPending = 0;
  for (const s of sales) {
    totalPending += toNum(s.totalAmount) - s.payments.reduce((ps, p) => ps + toNum(p.amount), 0);
  }

  if (sales.length === 0) {
    return { text: "✅ Sab payments received! Koi pending nahi hai. 🎉", intent: "PAYMENT_STATUS", confidence: 0.9 };
  }

  let text = `💵 **Pending Payments (${sales.length}):**\n\n`;
  for (const s of sales.slice(0, 6)) {
    const remaining = toNum(s.totalAmount) - s.payments.reduce((ps, p) => ps + toNum(p.amount), 0);
    text += `• ${s.saleNumber} — ${s.customer?.name ?? "Walk-in"} | Baki: ${formatCurrency(remaining)}\n`;
  }
  text += `\n💰 Total pending: ${formatCurrency(totalPending)}`;

  return {
    text,
    intent: "PAYMENT_STATUS",
    confidence: 0.9,
    cards: [{ type: "link", label: "All sales", href: "/m/material-sales" }],
  };
}

async function projectListResponse(companyId: string): Promise<AssistantResponse> {
  const portfolio = await getCompanyPortfolioSummary(companyId).catch(() => null);

  const projects = await prisma.project.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (projects.length === 0) {
    return { text: "Koi project nahi hai. Naya project banaiye.", intent: "PROJECT_LIST", confidence: 0.8 };
  }

  let text = `🏗️ **Projects (${projects.length}):**\n\n`;
  for (const p of projects.slice(0, 6)) {
    const statusIcon = p.status === "COMPLETED" ? "✅" : p.status === "ACTIVE" ? "🚧" : "📋";
    text += `${statusIcon} ${p.name} — ${p.type} | ${p.status}\n`;
  }

  if (portfolio) {
    text += `\n📊 Portfolio Value: ${formatCurrency(toNum(portfolio.totalPortfolioValue))}`;
    text += ` | Revenue: ${formatCurrency(toNum(portfolio.totalRevenue))}`;
    text += ` | Margin: ${formatNumber(toNum(portfolio.avgMarginPct), 1)}%`;
  }

  return {
    text,
    intent: "PROJECT_LIST",
    confidence: 0.9,
    cards: [{ type: "link", label: "All projects", href: "/m/projects" }],
  };
}

async function cashPositionResponse(companyId: string): Promise<AssistantResponse> {
  // Get cash/bank account balances from GL via trialBalance service
  const tb = await trialBalance(companyId).catch(() => null);

  let totalCash = 0;
  let cashText = "";

  if (tb) {
    for (const a of tb.accounts) {
      // Cash/bank accounts: 1000-1100 range
      if (a.code.startsWith("10") && toNum(a.balance) !== 0) {
        totalCash += toNum(a.balance);
        cashText += `• ${a.name}: ${formatCurrency(toNum(a.balance))}\n`;
      }
    }
  }

  // Supplier payables
  const suppliers = await prisma.supplier.findMany({
    where: { companyId, deletedAt: null },
    select: { balanceOwed: true },
  });
  const totalPayable = suppliers.reduce((s, sup) => s + toNum(sup.balanceOwed), 0);

  // Customer receivables from pending sales
  const pendingSales = await prisma.materialSale.findMany({
    where: { companyId, paymentStatus: { in: ["PENDING", "PARTIAL"] } },
    include: { payments: { select: { amount: true } } },
  });
  let totalReceivable = 0;
  for (const s of pendingSales) {
    totalReceivable += toNum(s.totalAmount) - s.payments.reduce((ps, p) => ps + toNum(p.amount), 0);
  }

  let text = `💵 **Cash Position:**\n\n`;
  if (cashText) {
    text += cashText;
  } else {
    text += `• Cash/Bank: ${formatCurrency(0)}\n`;
  }

  text += `\n💰 **Net Position:**\n`;
  text += `• Cash/Bank: ${formatCurrency(totalCash)}\n`;
  text += `• Receivable (aane wala): ${formatCurrency(totalReceivable)}\n`;
  text += `• Payable (dena hai): ${formatCurrency(totalPayable)}\n`;
  text += `• Net: ${formatCurrency(totalCash + totalReceivable - totalPayable)}`;

  return {
    text,
    intent: "CASH_POSITION",
    confidence: 0.9,
    cards: [
      { type: "link", label: "Trial balance", href: "/m/gl" },
      { type: "link", label: "Cash flow", href: "/m/cash-flow" },
    ],
  };
}

async function supplierPayableResponse(companyId: string): Promise<AssistantResponse> {
  const suppliers = await prisma.supplier.findMany({
    where: { companyId, deletedAt: null, balanceOwed: { gt: 0 } },
    orderBy: { balanceOwed: "desc" },
    take: 10,
  });

  const totalOwed = suppliers.reduce((s, sup) => s + toNum(sup.balanceOwed), 0);

  if (suppliers.length === 0) {
    return { text: "✅ Kisi supplier ko kuch nahi dena! Sab clear hai. 🎉", intent: "SUPPLIER_PAYABLE", confidence: 0.9 };
  }

  let text = `💸 **Supplier Payables:**\n\n`;
  for (const s of suppliers.slice(0, 6)) {
    text += `• ${s.name}: ${formatCurrency(toNum(s.balanceOwed))}\n`;
  }
  if (suppliers.length > 6) text += `...aur ${suppliers.length - 6} more\n`;
  text += `\n💰 Total payable: ${formatCurrency(totalOwed)}`;

  return {
    text,
    intent: "SUPPLIER_PAYABLE",
    confidence: 0.9,
    cards: [
      { type: "link", label: "All suppliers", href: "/m/suppliers" },
      { type: "link", label: "Make payment", href: "/m/supplier-payments", variant: "primary" },
    ],
  };
}

async function supplierListResponse(companyId: string): Promise<AssistantResponse> {
  const suppliers = await prisma.supplier.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { name: "asc" },
    take: 10,
    select: { id: true, name: true, balanceOwed: true, phone: true },
  });

  let text = `🚚 **Suppliers (${suppliers.length}):**\n\n`;
  for (const s of suppliers.slice(0, 8)) {
    text += `• ${s.name}${s.phone ? ` (${s.phone})` : ""}${toNum(s.balanceOwed) > 0 ? ` — Owed: ${formatCurrency(toNum(s.balanceOwed))}` : ""}\n`;
  }

  return {
    text,
    intent: "SUPPLIER_LIST",
    confidence: 0.9,
    cards: [{ type: "link", label: "All suppliers", href: "/m/suppliers" }],
  };
}

async function attendanceResponse(companyId: string): Promise<AssistantResponse> {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const today = new Date(todayStr + "T00:00:00");

  const records = await prisma.workerAttendance.findMany({
    where: { companyId, date: today },
    include: { employee: true },
    take: 20,
  });

  if (records.length === 0) {
    return {
      text: `📝 Aaj (${todayStr}) ka attendance abhi tak nahi bhar gaya.\n\nSite par attendance mark karein:`,
      intent: "ATTENDANCE_TODAY",
      confidence: 0.9,
      cards: [{ type: "link", label: "📝 Mark attendance", href: "/m/site/attendance", variant: "primary" }],
    };
  }

  const present = records.filter((r) => r.status === "PRESENT").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;
  const halfDay = records.filter((r) => r.status === "HALF_DAY").length;

  let text = `👷 **Aaj ka Attendance:**\n\n`;
  text += `✅ Present: ${present}\n`;
  text += `⏳ Half day: ${halfDay}\n`;
  text += `❌ Absent: ${absent}\n`;
  text += `Total: ${records.length} workers\n`;

  return {
    text,
    intent: "ATTENDANCE_TODAY",
    confidence: 0.9,
    cards: [{ type: "link", label: "Full attendance", href: "/m/site/attendance" }],
  };
}

function createPoResponse(): AssistantResponse {
  return {
    text: `Naya Purchase Order banani hai?\n\nSupplier, material, quantity, aur cost bataiye. Ya direct form kholein:`,
    intent: "CREATE_PO",
    confidence: 0.8,
    cards: [{ type: "link", label: "➕ New PO Form", href: "/m/purchase-orders/new", variant: "primary" }],
  };
}

function createReqResponse(): AssistantResponse {
  return {
    text: `Nayi Requisition banani hai?\n\nMaterial aur quantity bataiye. Ya form kholein:`,
    intent: "CREATE_REQUISITION",
    confidence: 0.8,
    cards: [{ type: "link", label: "➕ New Requisition", href: "/m/requisitions", variant: "primary" }],
  };
}

function autoReqResponse(): AssistantResponse {
  return {
    text: `Auto-requisition generate karna hai? Ye low stock materials ke liye automatically requisition banayega.\n\nConfirm karein:`,
    intent: "AUTO_REQUISITION",
    confidence: 0.8,
    cards: [
      {
        type: "confirm",
        label: "🔄 Auto-generate requisitions",
        endpoint: "/api/requisitions/auto",
        method: "POST",
        variant: "primary",
      },
    ],
  };
}

async function dprListResponse(companyId: string): Promise<AssistantResponse> {
  const dprs = await prisma.dailyProgressReport.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { project: true, submittedBy: true },
  });

  if (dprs.length === 0) {
    return { text: "Koi DPR nahi mila. Naya DPR banaiye.", intent: "DPR_LIST", confidence: 0.8, cards: [{ type: "link", label: "New DPR", href: "/m/dprs", variant: "primary" }] };
  }

  const pending = dprs.filter((d) => d.approvalStatus === "SUBMITTED").length;

  let text = `📋 **Recent DPRs (${dprs.length}):**\n\n`;
  for (const d of dprs.slice(0, 6)) {
    const icon = d.approvalStatus === "APPROVED" ? "✅" : d.approvalStatus === "REJECTED" ? "❌" : d.approvalStatus === "SUB_ADMIN_APPROVED" ? "⏳" : "📝";
    text += `${icon} ${d.project?.name ?? "Unknown"} — ${d.date.toISOString().split("T")[0]} | ${d.approvalStatus}\n`;
  }
  if (pending > 0) text += `\n⏳ ${pending} DPRs pending approval`;

  return {
    text,
    intent: "DPR_LIST",
    confidence: 0.9,
    cards: [{ type: "link", label: "All DPRs", href: "/m/dprs" }],
  };
}

async function trialBalanceResponse(companyId: string): Promise<AssistantResponse> {
  const tb = await trialBalance(companyId).catch(() => null);

  if (!tb) {
    return { text: "Trial balance nahi mila. GL setup check karein.", intent: "TRIAL_BALANCE", confidence: 0.7 };
  }

  let text = `📊 **Trial Balance:**\n\n`;
  for (const a of tb.accounts.slice(0, 10)) {
    const balance = toNum(a.balance);
    if (balance !== 0) {
      text += `• ${a.code} ${a.name}: ${formatCurrency(Math.abs(balance))} ${balance > 0 ? "Dr" : "Cr"}\n`;
    }
  }
  text += `\n💰 Total Debit: ${formatCurrency(toNum(tb.totalDebit))}`;
  text += `\n💰 Total Credit: ${formatCurrency(toNum(tb.totalCredit))}`;
  text += `\n${tb.isBalanced ? "✅ Balanced!" : "⚠️ Not balanced!"}`;

  return {
    text,
    intent: "TRIAL_BALANCE",
    confidence: 0.9,
    cards: [{ type: "link", label: "Full GL", href: "/m/gl" }],
  };
}

async function equipmentResponse(companyId: string): Promise<AssistantResponse> {
  const equipment = await prisma.equipment.findMany({
    where: { companyId, deletedAt: null },
    include: { assignments: { where: { status: "ACTIVE" }, include: { project: true }, take: 1 } },
    take: 10,
    orderBy: { createdAt: "desc" },
  });

  if (equipment.length === 0) {
    return { text: "Koi equipment registered nahi hai.", intent: "EQUIPMENT_STATUS", confidence: 0.8 };
  }

  const available = equipment.filter((e) => e.status === "AVAILABLE").length;
  const assigned = equipment.filter((e) => e.status === "ASSIGNED").length;
  const maintenance = equipment.filter((e) => e.status === "IN_MAINTENANCE").length;

  let text = `🔧 **Equipment (${equipment.length}):**\n\n`;
  text += `✅ Available: ${available} | 📤 Assigned: ${assigned} | 🔧 Maintenance: ${maintenance}\n\n`;
  for (const e of equipment.slice(0, 6)) {
    const assign = e.assignments[0];
    const assignText = assign?.project ? ` → ${assign.project.name}` : "";
    text += `• ${e.assetTag} ${e.name}${assignText} | ${e.status}\n`;
  }

  return {
    text,
    intent: "EQUIPMENT_STATUS",
    confidence: 0.9,
    cards: [{ type: "link", label: "All equipment", href: "/m/equipment" }],
  };
}

async function expenseResponse(companyId: string): Promise<AssistantResponse> {
  const expenses = await prisma.expense.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { project: true },
  });

  if (expenses.length === 0) {
    return { text: "Koi expense recorded nahi hai.", intent: "EXPENSE_LIST", confidence: 0.8 };
  }

  const total = expenses.reduce((s, e) => s + toNum(e.amount), 0);

  let text = `💸 **Recent Expenses (${expenses.length}):**\n\n`;
  for (const e of expenses.slice(0, 6)) {
    text += `• ${e.notes ?? e.category} | ${formatCurrency(toNum(e.amount))}${e.project ? ` | ${e.project.name}` : ""}\n`;
  }
  text += `\n💰 Total: ${formatCurrency(total)}`;

  return {
    text,
    intent: "EXPENSE_LIST",
    confidence: 0.9,
    cards: [{ type: "link", label: "All expenses", href: "/m/expenses" }],
  };
}

async function taskResponse(companyId: string): Promise<AssistantResponse> {
  // Tasks don't have companyId — they're scoped by workspace. Get all pending.
  const tasks = await prisma.task.findMany({
    where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
    include: { assignedTo: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (tasks.length === 0) {
    return { text: "✅ Koi pending task nahi hai!", intent: "TASK_LIST", confidence: 0.9 };
  }

  let text = `📋 **Pending Tasks (${tasks.length}):**\n\n`;
  for (const t of tasks.slice(0, 6)) {
    text += `• ${t.title}${t.assignedTo ? ` → ${t.assignedTo.name}` : ""}\n`;
  }

  return {
    text,
    intent: "TASK_LIST",
    confidence: 0.9,
    cards: [{ type: "link", label: "All tasks", href: "/m/tasks" }],
  };
}

async function workerListResponse(companyId: string): Promise<AssistantResponse> {
  const workers = await prisma.employee.findMany({
    where: { companyId, active: true },
    orderBy: { name: "asc" },
    take: 10,
    select: { id: true, name: true, trade: true, phone: true },
  });

  let text = `👷 **Workers (${workers.length}):**\n\n`;
  for (const w of workers.slice(0, 8)) {
    text += `• ${w.name} — ${w.trade ?? "General"}${w.phone ? ` (${w.phone})` : ""}\n`;
  }

  return {
    text,
    intent: "WORKER_LIST",
    confidence: 0.9,
    cards: [{ type: "link", label: "All workers", href: "/m/hr/workers" }],
  };
}

function unknownResponse(rawText: string): AssistantResponse {
  const lower = rawText.toLowerCase();

  if (lower.includes("kya") || lower.includes("what") || lower.includes("how") || lower.includes("kaise")) {
    return {
      text: `Samajh nahi aaya. Ye try karein:\n\n• "Stock kya hai?"\n• "Approvals pending?"\n• "Cash position"\n• "Help"`,
      intent: "UNKNOWN",
      confidence: 0,
      cards: [{ type: "button", label: "Help", endpoint: "/api/assistant", method: "POST", body: { text: "help" } }],
    };
  }

  return {
    text: `Maaf kijiye, samajh nahi aaya. "Help" likhein ya ye try karein:\n\n• "Stock kya hai?"\n• "Approvals pending?"\n• "Aaj ki sales"`,
    intent: "UNKNOWN",
    confidence: 0,
    cards: [{ type: "button", label: "Help", endpoint: "/api/assistant", method: "POST", body: { text: "help" } }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW INTENT HANDLERS — Attention, Monthly Summary, P&L, Spend, Approve All
// ═══════════════════════════════════════════════════════════════════════════

async function attentionResponse(companyId: string): Promise<AssistantResponse> {
  const [draftPOs, pendingReqs, overduePOs, lowStock, pendingDPRs] = await Promise.all([
    prisma.purchaseOrder.count({ where: { companyId, status: "DRAFT" } }),
    prisma.materialRequisition.count({ where: { project: { companyId }, status: "SUBMITTED" } }),
    prisma.purchaseOrder.count({
      where: { companyId, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { lt: new Date() } },
    }),
    lowStockAlerts(companyId).catch(() => []),
    prisma.dailyProgressReport.count({ where: { companyId, approvalStatus: "SUBMITTED" } }),
  ]);

  const items: string[] = [];
  if (draftPOs > 0) items.push(`📋 ${draftPOs} PO approve karne pending`);
  if (pendingReqs > 0) items.push(`📋 ${pendingReqs} requisition approve pending`);
  if (overduePOs > 0) items.push(`⚠️ ${overduePOs} PO overdue (delivery late)`);
  if (lowStock.length > 0) items.push(`📦 ${lowStock.length} material low stock par`);
  if (pendingDPRs > 0) items.push(`📝 ${pendingDPRs} DPR pending approval`);

  if (items.length === 0) {
    return {
      text: "✅ Sab smooth hai! Koi urgent attention nahi chahiye. 🎉",
      intent: "ATTENTION",
      confidence: 0.9,
    };
  }

  let text = `🔔 **Aapka attention chahiye:**\n\n`;
  for (const item of items) text += `${item}\n`;
  text += `\nKya karna hai? Bataiye aur main kar deta hoon!`;

  const cards: ActionCard[] = [];
  if (draftPOs > 0 || pendingReqs > 0) {
    cards.push({ type: "link", label: "Go to approvals", href: "/m/pulse/approvals", variant: "primary" });
  }
  if (lowStock.length > 0) {
    cards.push({ type: "button", label: "Auto-generate requisition", endpoint: "/api/requisitions/auto", method: "POST" });
  }

  return { text, cards, intent: "ATTENTION", confidence: 0.9 };
}

async function monthlySummaryResponse(companyId: string): Promise<AssistantResponse> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [sales, expenses, poCount, poTotal, newReqs, attendanceDays] = await Promise.all([
    prisma.materialSale.findMany({
      where: { companyId, createdAt: { gte: monthStart } },
      include: { payments: { select: { amount: true } } },
    }),
    prisma.expense.findMany({
      where: { companyId, createdAt: { gte: monthStart } },
    }),
    prisma.purchaseOrder.count({
      where: { companyId, createdAt: { gte: monthStart } },
    }),
    prisma.purchaseOrder.aggregate({
      where: { companyId, createdAt: { gte: monthStart } },
      _sum: { total: true },
    }),
    prisma.materialRequisition.count({
      where: { project: { companyId }, createdAt: { gte: monthStart } },
    }),
    prisma.workerAttendance.count({
      where: { companyId, date: { gte: monthStart } },
    }),
  ]);

  const totalSales = sales.reduce((s, sale) => s + toNum(sale.totalAmount), 0);
  const totalCollected = sales.reduce(
    (s, sale) => s + sale.payments.reduce((ps, p) => ps + toNum(p.amount), 0),
    0,
  );
  const totalExpenses = expenses.reduce((s, e) => s + toNum(e.amount), 0);
  const poSum = toNum(poTotal._sum.total ?? 0);
  const monthName = now.toLocaleString("en-IN", { month: "long" });

  let text = `📅 **${monthName} ${now.getFullYear()} Summary:**\n\n`;
  text += `💰 **Sales:**\n`;
  text += `• Total sales: ${sales.length} | Value: ${formatCurrency(totalSales)}\n`;
  text += `• Collected: ${formatCurrency(totalCollected)} | Pending: ${formatCurrency(totalSales - totalCollected)}\n\n`;
  text += `📦 **Procurement:**\n`;
  text += `• Purchase orders: ${poCount} | Value: ${formatCurrency(poSum)}\n`;
  text += `• Requisitions raised: ${newReqs}\n\n`;
  text += `💸 **Expenses:** ${formatCurrency(totalExpenses)}\n\n`;
  text += `👷 **Attendance records:** ${attendanceDays}\n`;
  text += `📊 **Net cash flow:** ${formatCurrency(totalCollected - totalExpenses - poSum)}`;

  return {
    text,
    intent: "MONTHLY_SUMMARY",
    confidence: 0.9,
    cards: [
      { type: "link", label: "Sales detail", href: "/m/material-sales" },
      { type: "link", label: "GL / P&L", href: "/m/gl" },
    ],
  };
}

async function profitLossResponse(companyId: string): Promise<AssistantResponse> {
  const tb = await trialBalance(companyId).catch(() => null);

  if (!tb) {
    return { text: "P&L nahi mila. GL setup check karein.", intent: "PROFIT_LOSS", confidence: 0.7 };
  }

  // Revenue accounts (4000-4999) and Expense accounts (5000-5999)
  let totalRevenue = 0;
  let totalExpenses = 0;
  let revenueText = "";
  let expenseText = "";

  for (const a of tb.accounts) {
    const balance = toNum(a.balance);
    if (a.code.startsWith("4") && balance !== 0) {
      totalRevenue += Math.abs(balance);
      revenueText += `• ${a.name}: ${formatCurrency(Math.abs(balance))}\n`;
    } else if (a.code.startsWith("5") && balance !== 0) {
      totalExpenses += Math.abs(balance);
      expenseText += `• ${a.name}: ${formatCurrency(Math.abs(balance))}\n`;
    }
  }

  const netProfit = totalRevenue - totalExpenses;

  let text = `📊 **Profit & Loss:**\n\n`;
  text += `💰 **Revenue:**\n${revenueText || "• (no revenue entries)\n"}`;
  text += `Total Revenue: ${formatCurrency(totalRevenue)}\n\n`;
  text += `💸 **Expenses:**\n${expenseText || "• (no expense entries)\n"}`;
  text += `Total Expenses: ${formatCurrency(totalExpenses)}\n\n`;
  text += `${netProfit >= 0 ? "✅" : "⚠️"} **Net ${netProfit >= 0 ? "Profit" : "Loss"}: ${formatCurrency(Math.abs(netProfit))}**`;

  return {
    text,
    intent: "PROFIT_LOSS",
    confidence: 0.9,
    cards: [{ type: "link", label: "Full GL", href: "/m/gl" }],
  };
}

async function spendAnalysisResponse(companyId: string, entities: ParsedEntities): Promise<AssistantResponse> {
  // If a specific material is mentioned, analyze spend on that material
  if (entities.materialName) {
    const receipts = await prisma.goodsReceipt.findMany({
      where: {
        purchaseOrder: { companyId },
        lines: { some: { material: { name: { contains: entities.materialName, mode: "insensitive" } } } },
      },
      include: {
        lines: { include: { material: true } },
        purchaseOrder: { include: { supplier: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    let totalSpend = 0;
    let text = `💸 **${entities.materialName.toUpperCase()} spend analysis:**\n\n`;

    for (const gr of receipts.slice(0, 6)) {
      for (const line of gr.lines) {
        if (line.material.name.toLowerCase().includes(entities.materialName.toLowerCase())) {
          const lineCost = toNum(line.qtyReceived) * toNum(line.unitCost);
          totalSpend += lineCost;
          text += `• ${formatNumber(toNum(line.qtyReceived), 2)} ${line.material.unit} @ ${formatCurrency(toNum(line.unitCost))} = ${formatCurrency(lineCost)}\n`;
          text += `   📦 ${gr.purchaseOrder?.supplier?.name ?? "Unknown"} | ${gr.createdAt.toISOString().split("T")[0]}\n`;
        }
      }
    }

    if (receipts.length === 0) {
      return { text: `${entities.materialName} par abhi tak kharcha nahi hua.`, intent: "SPEND_ANALYSIS", confidence: 0.8 };
    }

    text += `\n💰 Total ${entities.materialName} spend: ${formatCurrency(totalSpend)}`;
    return { text, intent: "SPEND_ANALYSIS", confidence: 0.9 };
  }

  // General spend analysis — by category
  const expenses = await prisma.expense.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    const cat = e.category;
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + toNum(e.amount));
  }

  const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);

  let text = `💸 **Spend Analysis (by category):**\n\n`;
  for (const [cat, amt] of sorted.slice(0, 8)) {
    const pct = total > 0 ? ((amt / total) * 100).toFixed(1) : "0";
    text += `• ${cat}: ${formatCurrency(amt)} (${pct}%)\n`;
  }
  text += `\n💰 Total: ${formatCurrency(total)}`;

  return {
    text,
    intent: "SPEND_ANALYSIS",
    confidence: 0.9,
    cards: [{ type: "link", label: "All expenses", href: "/m/expenses" }],
  };
}

async function approveAllResponse(companyId: string): Promise<AssistantResponse> {
  const draftPOs = await prisma.purchaseOrder.findMany({
    where: { companyId, status: "DRAFT" },
    include: { supplier: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const pendingReqs = await prisma.materialRequisition.findMany({
    where: { project: { companyId }, status: "SUBMITTED" },
    include: { project: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (draftPOs.length === 0 && pendingReqs.length === 0) {
    return { text: "✅ Koi pending approval nahi hai!", intent: "APPROVE_ALL", confidence: 0.9 };
  }

  let text = `⚠️ **Sab approve karna hai?**\n\n`;
  text += `📋 ${draftPOs.length} Purchase Orders\n`;
  text += `📋 ${pendingReqs.length} Requisitions\n\n`;
  text += `Total: ${draftPOs.length + pendingReqs.length} items\n\n`;
  text += `Confirm karein — ye sab ek saath approve ho jayenge:`;

  // Build confirm cards for each PO and requisition
  const cards: ActionCard[] = [];
  for (const po of draftPOs.slice(0, 10)) {
    cards.push({
      type: "confirm",
      label: `✅ ${po.poNumber} — ${po.supplier.name}`,
      endpoint: `/api/purchase-orders/${po.id}`,
      method: "PATCH",
      body: { action: "approve" },
      variant: "primary",
    });
  }
  for (const req of pendingReqs.slice(0, 10)) {
    cards.push({
      type: "confirm",
      label: `✅ ${req.reqNumber} — ${req.project?.name ?? "Unknown"}`,
      endpoint: `/api/requisitions/${req.id}`,
      method: "PATCH",
      body: { action: "approve" },
      variant: "primary",
    });
  }

  return { text, cards, intent: "APPROVE_ALL", confidence: 0.9 };
}

async function supplierPaymentResponse(companyId: string): Promise<AssistantResponse> {
  const suppliers = await prisma.supplier.findMany({
    where: { companyId, deletedAt: null, balanceOwed: { gt: 0 } },
    orderBy: { balanceOwed: "desc" },
    take: 10,
  });

  if (suppliers.length === 0) {
    return { text: "✅ Kisi supplier ko kuch nahi dena!", intent: "SUPPLIER_PAYMENT", confidence: 0.9 };
  }

  let text = `💸 **Supplier Payment:**\n\nKaunse supplier ko pay karna hai?\n\n`;
  const cards: ActionCard[] = suppliers.slice(0, 5).map((s) => ({
    type: "link" as const,
    label: `Pay ${s.name} (${formatCurrency(toNum(s.balanceOwed))})`,
    href: `/m/supplier-payments?supplierId=${s.id}`,
    variant: "primary" as const,
  }));

  return { text, cards, intent: "SUPPLIER_PAYMENT", confidence: 0.9 };
}
