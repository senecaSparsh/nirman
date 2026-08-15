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
  projectTotalCost,
  trialBalance,
} from "@nirman/services";
import { apiHandler, json, requireUser, getCompany, toNum, getCurrentUser } from "@/lib/server";
import { parseIntent, type Intent } from "@/lib/assistant/nlu";
import { processConversation, type ConversationContext } from "@/lib/assistant/conversation";
import { hasPermission, PERM, type Role } from "@/lib/roles";
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
  const user = await requireUser();
  const company = await getCompany();
  const role = (user.role ?? "MANAGER") as Role;

  const body = await req.json();
  const text: string = (body?.text ?? "").trim();
  if (!text) {
    return json({ error: "Text is required" }, { status: 400 });
  }

  // ── Conversation context from client (for multi-turn slot-filling) ──
  const context: ConversationContext = body?.context ?? { history: [] };

  const parsed = parseIntent(text);

  // ── Process through conversation state machine ──
  const conv = processConversation(parsed, context);

  // If the assistant needs more info, return the prompt without executing
  if (conv.needsInput && conv.prompt) {
    return json({
      text: conv.prompt,
      intent: conv.intent,
      confidence: parsed.confidence,
      needsInput: true,
      context: conv.updatedContext,
    });
  }

  // If this is a multi-step task, return the step prompt
  if (conv.hasMoreSteps && conv.prompt && !conv.ready) {
    return json({
      text: conv.prompt,
      intent: conv.intent,
      confidence: parsed.confidence,
      hasMoreSteps: true,
      context: conv.updatedContext,
    });
  }

  // ── Execute the intent with resolved entities ──
  const response = await executeIntent(conv.intent, conv.entities, company.id, text, role);

  // Add conversation context to the response
  const updatedHistory = [
    ...context.history,
    { role: "user" as const, text, intent: parsed.intent, entities: parsed.entities },
    { role: "assistant" as const, text: response.text, intent: conv.intent },
  ].slice(-20); // keep last 20 turns

  return json({
    ...response,
    intent: conv.intent,
    confidence: parsed.confidence,
    needsInput: false,
    hasMoreSteps: conv.hasMoreSteps,
    context: {
      history: updatedHistory,
      currentTask: conv.updatedContext.currentTask,
    },
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
  role: Role,
): Promise<AssistantResponse> {
  // ── Permission gate: check if the user's role can access this intent ──
  const permCheck = checkIntentPermission(intent, role);
  if (!permCheck.allowed) {
    return {
      text: `Aapke role (${roleLabel(role)}) ke liye ye action allowed nahi hai.\n\n${permCheck.reason ?? ""}`,
      intent,
      confidence: 0.9,
      cards: [{ type: "link", label: "Dashboard", href: "/m/home" }],
    };
  }

  switch (intent) {
    case "GREETING":
      return greetingResponse(role);
    case "HELP":
      return helpResponse(role);
    case "DASHBOARD":
      return dashboardResponse(companyId, role);
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
    case "TRANSFER_STOCK":
      return transferStockResponse();
    case "ISSUE_MATERIAL":
      return issueMaterialResponse();
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
    case "LAND_QUERY":
      return landQueryResponse(companyId);
    case "CUSTOMER_LIST":
      return customerListResponse(companyId);
    case "PAYROLL_STATUS":
      return payrollResponse(companyId);
    case "WORK_ORDER_LIST":
      return workOrderResponse(companyId);
    case "BOQ_QUERY":
      return boqResponse(companyId);
    case "WBS_QUERY":
      return wbsResponse(companyId);
    case "BUDGET_VARIANCE":
      return budgetVarianceResponse(companyId);
    case "PORTAL_LISTING":
      return portalListingResponse(companyId);
    case "SCRAP_STATUS":
      return scrapResponse(companyId);
    case "TALLY_STATUS":
      return tallyResponse(companyId);
    // ── Real estate owner workflows ──
    case "PORTFOLIO_OVERVIEW":
      return portfolioOverviewResponse(companyId);
    case "UNIT_STATUS":
      return unitStatusResponse(companyId, entities);
    case "UNIT_VALUATION":
      return unitValuationResponse(companyId, entities);
    case "COST_PER_SQFT":
      return costPerSqftResponse(companyId);
    case "SALES_PIPELINE":
      return salesPipelineResponse(companyId);
    case "PAYMENT_SCHEDULE":
      return paymentScheduleResponse(companyId, entities);
    case "PROFIT_MARGIN":
      return profitMarginResponse(companyId);
    case "AVAILABLE_INVENTORY":
      return availableInventoryResponse(companyId);
    case "CONSTRUCTION_PROGRESS":
      return constructionProgressResponse(companyId);
    default:
      return unknownResponse(rawText);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PERMISSION GATE
// ═══════════════════════════════════════════════════════════════════════════

/** Map an intent to the permission required to execute it. */
function checkIntentPermission(intent: Intent, role: Role): { allowed: boolean; reason?: string } {
  // Read-only intents — allowed for any authenticated user with the relevant .view perm
  const READ_PERMS: Partial<Record<Intent, string>> = {
    STOCK_QUERY: PERM.INVENTORY_VIEW,
    LOW_STOCK: PERM.INVENTORY_VIEW,
    APPROVALS_LIST: PERM.PROCUREMENT_VIEW,
    SALES_LIST: PERM.SALES_VIEW,
    PAYMENT_STATUS: PERM.SALES_VIEW,
    PROJECT_STATUS: PERM.PROJECTS_VIEW,
    PROJECT_LIST: PERM.PROJECTS_VIEW,
    CASH_POSITION: PERM.FINANCE_VIEW,
    SUPPLIER_PAYABLE: PERM.FINANCE_VIEW,
    SUPPLIER_LIST: PERM.PROCUREMENT_VIEW,
    ATTENDANCE_TODAY: PERM.HR_VIEW,
    DPR_LIST: PERM.DPR_VIEW,
    TRIAL_BALANCE: PERM.FINANCE_VIEW,
    EQUIPMENT_STATUS: PERM.ASSETS_VIEW,
    EXPENSE_LIST: PERM.FINANCE_VIEW,
    TASK_LIST: PERM.TASKS_VIEW,
    WORKER_LIST: PERM.HR_VIEW,
    ATTENTION: PERM.PROJECTS_VIEW,
    MONTHLY_SUMMARY: PERM.FINANCE_VIEW,
    PROFIT_LOSS: PERM.FINANCE_VIEW,
    SPEND_ANALYSIS: PERM.FINANCE_VIEW,
    LAND_QUERY: PERM.ASSETS_VIEW,
    CUSTOMER_LIST: PERM.SALES_VIEW,
    PAYROLL_STATUS: PERM.PAYROLL_VIEW,
    WORK_ORDER_LIST: PERM.WO_MANAGE,
    BOQ_QUERY: PERM.PROJECTS_VIEW,
    WBS_QUERY: PERM.PROJECTS_VIEW,
    BUDGET_VARIANCE: PERM.PROJECTS_VIEW,
    PORTAL_LISTING: PERM.ASSETS_VIEW,
    SCRAP_STATUS: PERM.INVENTORY_VIEW,
    TALLY_STATUS: PERM.FINANCE_VIEW,
    DASHBOARD: PERM.PROJECTS_VIEW,
    // Real estate owner workflows
    PORTFOLIO_OVERVIEW: PERM.ASSETS_VIEW,
    UNIT_STATUS: PERM.ASSETS_VIEW,
    UNIT_VALUATION: PERM.ASSETS_VIEW,
    COST_PER_SQFT: PERM.PROJECTS_VIEW,
    SALES_PIPELINE: PERM.SALES_VIEW,
    PAYMENT_SCHEDULE: PERM.SALES_VIEW,
    PROFIT_MARGIN: PERM.FINANCE_VIEW,
    AVAILABLE_INVENTORY: PERM.ASSETS_VIEW,
    CONSTRUCTION_PROGRESS: PERM.PROJECTS_VIEW,
  };

  // Write/action intents — require the specific action permission
  const WRITE_PERMS: Partial<Record<Intent, string>> = {
    APPROVE_PO: PERM.PO_APPROVE,
    APPROVE_REQUISITION: PERM.REQUISITION_APPROVE,
    REJECT_PO: PERM.PO_APPROVE,
    REJECT_REQUISITION: PERM.REQUISITION_APPROVE,
    SALE_CREATE: PERM.SALE_CREATE,
    CREATE_PO: PERM.PROCUREMENT_MANAGE,
    CREATE_REQUISITION: PERM.PROCUREMENT_MANAGE,
    AUTO_REQUISITION: PERM.PROCUREMENT_MANAGE,
    APPROVE_ALL: PERM.PO_APPROVE,
    SUPPLIER_PAYMENT: PERM.FINANCE_MANAGE,
    TRANSFER_STOCK: PERM.STOCK_TRANSFER,
    ISSUE_MATERIAL: PERM.STOCK_ISSUE,
  };

  const readPerm = READ_PERMS[intent];
  const writePerm = WRITE_PERMS[intent];
  const requiredPerm = writePerm ?? readPerm;

  if (!requiredPerm) {
    // GREETING, HELP, UNKNOWN — no permission needed
    return { allowed: true };
  }

  if (hasPermission(role, requiredPerm)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Ye feature "${requiredPerm}" permission chahiye. Aapke role (${roleLabel(role)}) mein ye nahi hai.`,
  };
}

function roleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MANAGER: "Manager",
    SUPERVISOR: "Supervisor",
    SALES: "Sales",
    ACCOUNTANT: "Accountant",
  };
  return labels[role] ?? role;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function greetingResponse(role: Role): AssistantResponse {
  const greetings: Record<Role, string[]> = {
    OWNER: [
      "Namaste! Main Sahayak hoon. Aapka poora business ready hai. Bataiye, kya dekhna hai?",
      "Hello Owner! Sab kuch ready hai — stock, sales, approvals, finance. Bolo kya chahiye.",
    ],
    ADMIN: [
      "Namaste! Admin mode. Sab modules ready hain. Bataiye kya help karu?",
      "Hello! Aapka system ready hai. Stock, approvals, finance — sab poochho.",
    ],
    MANAGER: [
      "Namaste! Manager mode. Projects, procurement, inventory — sab manage kar sakte ho. Bolo?",
      "Hello! Aapke projects aur approvals ready hain. Kya karna hai?",
    ],
    SUPERVISOR: [
      "Namaste! Supervisor mode. Site, stock, attendance, DPR — sab dekh sakte ho. Bolo?",
      "Hello! Site updates ke liye ready hoon. Attendance, stock, DPR — kya chahiye?",
    ],
    SALES: [
      "Namaste! Sales mode. Customers, sales, payments — sab ready. Bolo kya karna hai?",
      "Hello! Aapke sales tools ready hain. Naya sale, customer, payment — bolo?",
    ],
    ACCOUNTANT: [
      "Namaste! Accountant mode. Finance, expenses, GL, payroll — sab ready. Bolo?",
      "Hello! Books ready hain. Trial balance, expenses, payments — kya dekhna hai?",
    ],
  };
  const opts = greetings[role] ?? greetings.MANAGER;
  return {
    text: opts[Math.floor(Math.random() * opts.length)] ?? opts[0]!,
    intent: "GREETING",
    confidence: 1,
    cards: roleAwareQuickLinks(role),
  };
}

function roleAwareQuickLinks(role: Role): ActionCard[] {
  const cards: ActionCard[] = [];
  if (hasPermission(role, PERM.INVENTORY_VIEW)) {
    cards.push({ type: "link", label: "Stock dekho", href: "/m/materials" });
  }
  if (hasPermission(role, PERM.PO_APPROVE) || hasPermission(role, PERM.REQUISITION_APPROVE)) {
    cards.push({ type: "link", label: "Approvals", href: "/m/pulse/approvals" });
  }
  if (hasPermission(role, PERM.SALES_VIEW)) {
    cards.push({ type: "link", label: "Sales", href: "/m/material-sales" });
  }
  if (hasPermission(role, PERM.FINANCE_VIEW)) {
    cards.push({ type: "link", label: "Finance", href: "/m/gl" });
  }
  return cards.slice(0, 3);
}

function helpResponse(role: Role): AssistantResponse {
  // Role-specific help text — only show commands the user can actually use
  const sections: string[] = [];

  if (hasPermission(role, PERM.INVENTORY_VIEW)) {
    sections.push(`**Stock & Inventory**
• "Stock kya hai?" — current stock
• "Low stock kya hai?" — kya khatam ho raha
• "Cement kitna hai?" — specific material
• "Scrap status" — scrap inventory`);
  }
  if (hasPermission(role, PERM.PO_APPROVE) || hasPermission(role, PERM.REQUISITION_APPROVE)) {
    sections.push(`**Approvals**
• "Approvals pending?" — pending list
• "PO-0011 approve kar" — specific PO
• "Sab approve kar" — approve all`);
  }
  if (hasPermission(role, PERM.SALES_VIEW)) {
    sections.push(`**Sales & Payment**
• "Aaj ki sales" — recent sales
• "Payment kitni baki?" — pending payments
• "Customers dikhao" — customer list`);
  }
  if (hasPermission(role, PERM.PROJECTS_VIEW)) {
    sections.push(`**Projects & Reports**
• "Project status" — all projects
• "DPR pending" — daily reports
• "Budget variance" — budget vs actual
• "BOQ dikhao" — bill of quantities`);
  }
  if (hasPermission(role, PERM.FINANCE_VIEW)) {
    sections.push(`**Finance**
• "Cash position" — cash & bank
• "Trial balance" — GL summary
• "Profit kitna?" — P&L
• "Supplier ko kitna dena?" — payables
• "Tally status" — sync status`);
  }
  if (hasPermission(role, PERM.HR_VIEW)) {
    sections.push(`**Site & Workers**
• "Aaj kitne worker aaye?" — attendance
• "Payroll status" — salary info
• "Workers dikhao" — employee list`);
  }
  if (hasPermission(role, PERM.ASSETS_VIEW)) {
    sections.push(`**Real Estate & Property**
• "Portfolio overview" — poora business summary
• "Kitne flat available?" — unit status by type
• "Flat ka valuation?" — asking price + margin
• "Kya bechne ke liye hai?" — available inventory
• "Land dikhao" — land parcels
• "Portal listings" — 99acres/MagicBricks status`);
  }
  if (hasPermission(role, PERM.SALES_VIEW)) {
    sections.push(`**Sales Pipeline**
• "Sales pipeline" — booking/deposit/completion
• "Installment kitna baki?" — payment schedule
• "Kitne flat book huye?" — booking status`);
  }
  if (hasPermission(role, PERM.PROJECTS_VIEW)) {
    sections.push(`**Construction**
• "Construction progress" — kitna ban gaya
• "Cost per sqft" — project cost analysis
• "Budget variance" — budget vs actual
• "Project profit margin" — profitability per project`);
  }
  sections.push(`**General**
• "Dashboard" — role-based overview
• "Is mahine ka summary" — monthly summary
• "Kya karna hai?" — what needs attention`);

  return {
    text: `Main ye sab kar sakta hoon:\n\n${sections.join("\n\n")}\n\nBolo ya type karo — Hindi, English, ya dono!`,
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
  // Tasks don't have companyId — they're scoped by assignee. Get all pending.
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

// ═══════════════════════════════════════════════════════════════════════════
// NEW INTENT HANDLERS — Dashboard, Land, Customers, Payroll, WO, BOQ, WBS,
// Budget Variance, Portal, Scrap, Tally, Transfer, Issue
// ═══════════════════════════════════════════════════════════════════════════

async function dashboardResponse(companyId: string, role: Role): Promise<AssistantResponse> {
  const items: string[] = [];
  const cards: ActionCard[] = [];

  // Role-aware dashboard — show what's relevant to the user's permissions
  if (hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    const [draftPOs, pendingReqs] = await Promise.all([
      prisma.purchaseOrder.count({ where: { companyId, status: "DRAFT" } }),
      prisma.materialRequisition.count({ where: { project: { companyId }, status: "SUBMITTED" } }),
    ]);
    if (draftPOs > 0 || pendingReqs > 0) {
      items.push(`Approvals: ${draftPOs} POs + ${pendingReqs} requisitions pending`);
      if (hasPermission(role, PERM.PO_APPROVE)) {
        cards.push({ type: "link", label: "Approvals kholo", href: "/m/pulse/approvals" });
      }
    }
  }

  if (hasPermission(role, PERM.INVENTORY_VIEW)) {
    const lowStock = await lowStockAlerts(companyId).catch(() => []);
    if (lowStock.length > 0) {
      items.push(`Low stock: ${lowStock.length} materials`);
      cards.push({ type: "link", label: "Stock dekho", href: "/m/materials" });
    }
  }

  if (hasPermission(role, PERM.SALES_VIEW)) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todaySales = await prisma.materialSale.count({
      where: { companyId, createdAt: { gte: todayStart } },
    });
    if (todaySales > 0) {
      items.push(`Aaj ${todaySales} sales hui`);
      cards.push({ type: "link", label: "Sales dekho", href: "/m/material-sales" });
    }
  }

  if (hasPermission(role, PERM.FINANCE_VIEW)) {
    const suppliers = await prisma.supplier.findMany({
      where: { companyId, deletedAt: null, balanceOwed: { gt: 0 } },
      select: { balanceOwed: true },
    });
    const totalPayable = suppliers.reduce((s, sup) => s + toNum(sup.balanceOwed), 0);
    if (totalPayable > 0) {
      items.push(`Supplier payable: ${formatCurrency(totalPayable)}`);
    }
  }

  if (hasPermission(role, PERM.HR_VIEW)) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const attendanceToday = await prisma.workerAttendance.count({
      where: { companyId, date: { gte: todayStart } },
    });
    if (attendanceToday > 0) {
      items.push(`Aaj ${attendanceToday} attendance records`);
    }
  }

  // ── Real estate owner metrics ──
  if (hasPermission(role, PERM.ASSETS_VIEW)) {
    const [availableUnits, reservedUnits, depositSales] = await Promise.all([
      prisma.builtUnit.count({
        where: { project: { companyId, deletedAt: null }, status: "AVAILABLE", deletedAt: null },
      }),
      prisma.builtUnit.count({
        where: { project: { companyId, deletedAt: null }, status: "RESERVED", deletedAt: null },
      }),
      prisma.assetSale.count({
        where: { companyId, saleStage: "DEPOSIT_RECEIVED" },
      }),
    ]);
    if (availableUnits > 0) {
      items.push(`${availableUnits} flats available for sale`);
      cards.push({ type: "link", label: "Available units", href: "/m/units" });
    }
    if (reservedUnits > 0 || depositSales > 0) {
      items.push(`${reservedUnits} reserved | ${depositSales} deposits pending completion`);
    }
  }

  if (hasPermission(role, PERM.PROJECTS_VIEW)) {
    const activeProjects = await prisma.project.count({
      where: { companyId, deletedAt: null, status: "ACTIVE" },
    });
    if (activeProjects > 0) {
      items.push(`${activeProjects} active projects under construction`);
    }
  }

  if (items.length === 0) {
    return {
      text: `Sab smooth hai! Koi urgent item nahi hai. Kya specific dekhna hai?`,
      intent: "DASHBOARD",
      confidence: 0.9,
      cards: roleAwareQuickLinks(role),
    };
  }

  let text = `**Aapka Dashboard:**\n\n`;
  for (const item of items) text += `• ${item}\n`;
  text += `\nKya karna hai? Bolo aur main kar deta hoon.`;

  return { text, cards: cards.length > 0 ? cards.slice(0, 3) : undefined, intent: "DASHBOARD", confidence: 0.9 };
}

async function landQueryResponse(companyId: string): Promise<AssistantResponse> {
  const parcels = await prisma.landParcel.findMany({
    where: { landPurchase: { companyId }, deletedAt: null },
    include: { landPurchase: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (parcels.length === 0) {
    return { text: "Koi land parcel registered nahi hai.", intent: "LAND_QUERY", confidence: 0.8, cards: [{ type: "link", label: "Land module", href: "/m/land" }] };
  }

  const totalArea = parcels.reduce((s, p) => s + toNum(p.area), 0);
  const totalValue = parcels.reduce((s, p) => s + toNum(p.currentValuation), 0);

  let text = `**Land Parcels (${parcels.length}):**\n\n`;
  for (const p of parcels.slice(0, 6)) {
    const status = p.status === "PARTITIONED" ? " (partitioned)" : p.status === "SOLD" ? " (sold)" : "";
    text += `• ${p.number} — ${formatNumber(toNum(p.area), 2)} sqft | ${formatCurrency(toNum(p.currentValuation))}${status}\n`;
  }
  text += `\nTotal area: ${formatNumber(totalArea, 2)} sqft | Total value: ${formatCurrency(totalValue)}`;

  return { text, intent: "LAND_QUERY", confidence: 0.9, cards: [{ type: "link", label: "All land", href: "/m/land" }] };
}

async function customerListResponse(companyId: string): Promise<AssistantResponse> {
  const customers = await prisma.customer.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { name: "asc" },
    take: 10,
    select: { id: true, name: true, phone: true, email: true },
  });

  if (customers.length === 0) {
    return { text: "Koi customer registered nahi hai.", intent: "CUSTOMER_LIST", confidence: 0.8, cards: [{ type: "link", label: "Add customer", href: "/m/customers/new", variant: "primary" }] };
  }

  let text = `**Customers (${customers.length}):**\n\n`;
  for (const c of customers.slice(0, 8)) {
    text += `• ${c.name}${c.phone ? ` (${c.phone})` : ""}\n`;
  }

  return { text, intent: "CUSTOMER_LIST", confidence: 0.9, cards: [{ type: "link", label: "All customers", href: "/m/customers" }] };
}

async function payrollResponse(companyId: string): Promise<AssistantResponse> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const payrolls = await prisma.payrollPeriod.findMany({
    where: { companyId, startDate: { gte: monthStart } },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { _count: { select: { lines: true } } },
  });

  if (payrolls.length === 0) {
    return { text: "Is mahine ka payroll abhi generate nahi hua.", intent: "PAYROLL_STATUS", confidence: 0.8, cards: [{ type: "link", label: "Payroll module", href: "/m/books/payroll", variant: "primary" }] };
  }

  let text = `**Payroll Status (${payrolls.length}):**\n\n`;
  for (const p of payrolls) {
    const monthName = new Date(p.year, p.month - 1).toLocaleString("en-IN", { month: "long" });
    text += `• ${monthName} ${p.year} — ${p._count.lines} employees | ${formatCurrency(toNum(p.totalGross))} gross | ${p.status}\n`;
  }

  return { text, intent: "PAYROLL_STATUS", confidence: 0.9, cards: [{ type: "link", label: "Payroll detail", href: "/m/books/payroll" }] };
}

async function workOrderResponse(companyId: string): Promise<AssistantResponse> {
  const wos = await prisma.subcontractorWorkOrder.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { subcontractor: { select: { name: true } }, project: { select: { name: true } } },
  });

  if (wos.length === 0) {
    return { text: "Koi work order nahi hai.", intent: "WORK_ORDER_LIST", confidence: 0.8 };
  }

  let text = `**Work Orders (${wos.length}):**\n\n`;
  for (const w of wos.slice(0, 6)) {
    text += `• ${w.workOrderNumber} — ${w.subcontractor?.name ?? "Unknown"} | ${w.project?.name ?? "No project"} | ${w.status}\n`;
  }

  return { text, intent: "WORK_ORDER_LIST", confidence: 0.9, cards: [{ type: "link", label: "All work orders", href: "/m/work-orders" }] };
}

async function boqResponse(companyId: string): Promise<AssistantResponse> {
  const items = await prisma.boqItem.findMany({
    where: { project: { companyId, deletedAt: null }, type: "LINE_ITEM" },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { project: { select: { name: true } } },
  });

  if (items.length === 0) {
    return { text: "Koi BOQ item nahi hai.", intent: "BOQ_QUERY", confidence: 0.8, cards: [{ type: "link", label: "BOQ module", href: "/m/boq" }] };
  }

  const totalValue = items.reduce((s, i) => s + toNum(i.estimatedAmount), 0);

  let text = `**BOQ Items (${items.length}):**\n\n`;
  for (const i of items.slice(0, 6)) {
    text += `• ${i.description} — ${i.project?.name ?? "No project"} | ${formatCurrency(toNum(i.estimatedAmount))}\n`;
  }
  text += `\nTotal BOQ value: ${formatCurrency(totalValue)}`;

  return { text, intent: "BOQ_QUERY", confidence: 0.9, cards: [{ type: "link", label: "All BOQ", href: "/m/boq" }] };
}

async function wbsResponse(companyId: string): Promise<AssistantResponse> {
  const nodes = await prisma.wbsNode.findMany({
    where: { project: { companyId, deletedAt: null } },
    orderBy: { createdAt: "asc" },
    take: 15,
    include: { project: { select: { name: true } } },
  });

  if (nodes.length === 0) {
    return { text: "Koi WBS node nahi hai.", intent: "WBS_QUERY", confidence: 0.8, cards: [{ type: "link", label: "WBS module", href: "/m/wbs" }] };
  }

  let text = `**WBS Nodes (${nodes.length}):**\n\n`;
  for (const n of nodes.slice(0, 8)) {
    text += `• ${n.name} — ${n.project?.name ?? "No project"} | ${n.type}\n`;
  }

  return { text, intent: "WBS_QUERY", confidence: 0.9, cards: [{ type: "link", label: "WBS tree", href: "/m/wbs" }] };
}

async function budgetVarianceResponse(companyId: string): Promise<AssistantResponse> {
  const projects = await prisma.project.findMany({
    where: { companyId, deletedAt: null, totalProjectCost: { not: null } },
    take: 10,
    select: { id: true, name: true, totalProjectCost: true, totalBudget: true },
  });

  if (projects.length === 0) {
    return { text: "Koi budget data nahi hai.", intent: "BUDGET_VARIANCE", confidence: 0.8, cards: [{ type: "link", label: "Budget variance", href: "/m/budget-variance" }] };
  }

  let text = `**Budget vs Actual:**\n\n`;
  for (const p of projects.slice(0, 6)) {
    const budget = toNum(p.totalBudget);
    const actual = toNum(p.totalProjectCost);
    const variance = budget - actual;
    const pct = budget > 0 ? ((variance / budget) * 100).toFixed(1) : "0";
    const icon = variance >= 0 ? "OK" : "OVER";
    text += `• ${p.name}: Budget ${formatCurrency(budget)} | Actual ${formatCurrency(actual)} | ${icon} ${pct}%\n`;
  }

  return { text, intent: "BUDGET_VARIANCE", confidence: 0.9, cards: [{ type: "link", label: "Budget detail", href: "/m/budget-variance" }] };
}

async function portalListingResponse(companyId: string): Promise<AssistantResponse> {
  const listings = await prisma.portalListing.findMany({
    where: { builtUnit: { project: { companyId, deletedAt: null } } },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { builtUnit: { select: { unitNumber: true, project: { select: { name: true } } } } },
  });

  if (listings.length === 0) {
    return { text: "Koi portal listing nahi hai.", intent: "PORTAL_LISTING", confidence: 0.8, cards: [{ type: "link", label: "Portal listings", href: "/m/portal-listings" }] };
  }

  const listed = listings.filter((l) => l.status === "LISTED").length;
  const draft = listings.filter((l) => l.status === "DRAFT").length;

  let text = `**Portal Listings (${listings.length}):**\n\n`;
  text += `Listed: ${listed} | Draft: ${draft}\n\n`;
  for (const l of listings.slice(0, 6)) {
    text += `• ${l.portalName} — ${l.builtUnit?.unitNumber ?? "Unit"} | ${l.status}\n`;
  }

  return { text, intent: "PORTAL_LISTING", confidence: 0.9, cards: [{ type: "link", label: "All listings", href: "/m/portal-listings" }] };
}

async function scrapResponse(companyId: string): Promise<AssistantResponse> {
  const scraps = await prisma.scrapGeneration.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { _count: { select: { lines: true } } },
  });

  if (scraps.length === 0) {
    return { text: "Koi scrap generation nahi hai.", intent: "SCRAP_STATUS", confidence: 0.8, cards: [{ type: "link", label: "Scrap module", href: "/m/scrap-generations" }] };
  }

  let text = `**Scrap Generations (${scraps.length}):**\n\n`;
  for (const s of scraps.slice(0, 6)) {
    text += `• ${s.scrapNumber} — ${s._count.lines} items | ${s.createdAt.toISOString().split("T")[0]}\n`;
  }

  return { text, intent: "SCRAP_STATUS", confidence: 0.9, cards: [{ type: "link", label: "All scrap", href: "/m/scrap-generations" }] };
}

async function tallyResponse(companyId: string): Promise<AssistantResponse> {
  const [pending, synced, failed] = await Promise.all([
    prisma.tallySyncLog.count({ where: { companyId, syncStatus: "PENDING" } }),
    prisma.tallySyncLog.count({ where: { companyId, syncStatus: "SYNCED" } }),
    prisma.tallySyncLog.count({ where: { companyId, syncStatus: "FAILED" } }),
  ]);

  if (pending === 0 && synced === 0 && failed === 0) {
    return { text: "Koi Tally sync data nahi hai. Pehle journal entries banao.", intent: "TALLY_STATUS", confidence: 0.8, cards: [{ type: "link", label: "GL page", href: "/m/gl" }] };
  }

  let text = `**Tally Sync Status:**\n\n`;
  text += `Synced: ${synced}\n`;
  text += `Pending: ${pending}\n`;
  text += `Failed: ${failed}\n`;

  if (pending > 0) {
    text += `\n${pending} entries sync karne pending hain.`;
    return { text, intent: "TALLY_STATUS", confidence: 0.9, cards: [{ type: "link", label: "Sync now", href: "/m/gl", variant: "primary" }] };
  }

  return { text, intent: "TALLY_STATUS", confidence: 0.9, cards: [{ type: "link", label: "GL page", href: "/m/gl" }] };
}

function transferStockResponse(): AssistantResponse {
  return {
    text: `Stock transfer karna hai?\n\nKaunsa material, kahan se, kahan tak, aur kitna? Ya direct form kholein:`,
    intent: "TRANSFER_STOCK",
    confidence: 0.8,
    cards: [{ type: "link", label: "New Transfer", href: "/m/transfers/new", variant: "primary" }],
  };
}

function issueMaterialResponse(): AssistantResponse {
  return {
    text: `Material issue karna hai?\n\nKaunsa material, kaunse project/site ko, aur kitna? Ya form kholein:`,
    intent: "ISSUE_MATERIAL",
    confidence: 0.8,
    cards: [{ type: "link", label: "Issue Material", href: "/m/site/issue", variant: "primary" }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// REAL ESTATE OWNER WORKFLOW HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// ── Portfolio Overview — company-wide cockpit ─────────────────────────────
async function portfolioOverviewResponse(companyId: string): Promise<AssistantResponse> {
  const summary = await getCompanyPortfolioSummary(companyId).catch(() => null);

  if (!summary) {
    return {
      text: "Portfolio summary nahi mil paayi. Thodi der baad try karein.",
      intent: "PORTFOLIO_OVERVIEW",
      confidence: 0.7,
      cards: [{ type: "link", label: "Dashboard", href: "/m/home" }],
    };
  }

  const text = `**Aapka Portfolio Overview:**\n
Total Portfolio Value: ${formatCurrency(toNum(summary.totalPortfolioValue))}
Unsold Asset Value: ${formatCurrency(toNum(summary.unsoldAssetValue))}
Inventory Value: ${formatCurrency(toNum(summary.inventoryValue))}

Revenue (total): ${formatCurrency(toNum(summary.totalRevenue))}
Cost (total): ${formatCurrency(toNum(summary.totalCost))}
Profit: ${formatCurrency(toNum(summary.totalProfit))}
Average Margin: ${summary.avgMarginPct ? `${toNum(summary.avgMarginPct)}%` : "N/A"}

Units: ${summary.totalUnits} total | ${summary.soldUnits} sold | ${summary.availableUnits} available

Kya detail mein dekhna hai? Project-wise profit ya available units?`;

  return {
    text,
    intent: "PORTFOLIO_OVERVIEW",
    confidence: 0.9,
    cards: [
      { type: "link", label: "Available units", href: "/m/units" },
      { type: "link", label: "Projects", href: "/m/projects" },
    ],
  };
}

// ── Unit Status — flat/shop counts by status ──────────────────────────────
async function unitStatusResponse(companyId: string, entities: ParsedEntities): Promise<AssistantResponse> {
  // If a specific project is mentioned, filter by it
  let projectFilter: { companyId: string; deletedAt: null; id?: string } = {
    companyId,
    deletedAt: null,
  };

  if (entities.projectName) {
    const proj = await prisma.project.findFirst({
      where: { companyId, deletedAt: null, name: { contains: entities.projectName, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (proj) {
      projectFilter = { ...projectFilter, id: proj.id };
    }
  }

  const units = await prisma.builtUnit.findMany({
    where: { project: projectFilter, deletedAt: null },
    select: { status: true, unitType: true, area: true, askingPrice: true },
  });

  if (units.length === 0) {
    return {
      text: "Koi unit registered nahi hai. Pehle project aur units banao.",
      intent: "UNIT_STATUS",
      confidence: 0.8,
      cards: [{ type: "link", label: "Projects", href: "/m/projects" }],
    };
  }

  // Count by status
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const u of units) {
    byStatus[u.status] = (byStatus[u.status] ?? 0) + 1;
    byType[u.unitType] = (byType[u.unitType] ?? 0) + 1;
  }

  let text = `**Unit Status (${units.length} total):**\n\n`;
  const statusLabels: Record<string, string> = {
    PLANNED: "Planned (banane wala)",
    UNDER_CONSTRUCTION: "Under Construction (ban rahe)",
    AVAILABLE: "Available (bechne ke liye ready)",
    RESERVED: "Reserved (deposit aaya)",
    HOLD: "On Hold",
    SOLD: "Sold (bech gaye)",
    RENTED: "Rented (kiraye par)",
  };
  for (const [status, count] of Object.entries(byStatus)) {
    text += `• ${statusLabels[status] ?? status}: ${count}\n`;
  }

  // Type breakdown
  const typeLabels: Record<string, string> = {
    BHK_1: "1 BHK", BHK_2: "2 BHK", BHK_3: "3 BHK", BHK_4: "4 BHK",
    SHOP: "Shop", OFFICE: "Office", WAREHOUSE_UNIT: "Warehouse",
    VILLA: "Villa", OTHER: "Other",
  };
  text += `\n**Type wise:**\n`;
  for (const [type, count] of Object.entries(byType)) {
    text += `• ${typeLabels[type] ?? type}: ${count}\n`;
  }

  return {
    text,
    intent: "UNIT_STATUS",
    confidence: 0.9,
    cards: [{ type: "link", label: "All units", href: "/m/units" }],
  };
}

// ── Unit Valuation — asking price, current valuation ──────────────────────
async function unitValuationResponse(companyId: string, entities: ParsedEntities): Promise<AssistantResponse> {
  // If a specific project is mentioned, filter by it
  const whereClause: { project: { companyId: string; deletedAt: null; name?: { contains: string; mode: "insensitive" } }, deletedAt: null, status?: string } = {
    project: { companyId, deletedAt: null },
    deletedAt: null,
  };

  if (entities.projectName) {
    whereClause.project.name = { contains: entities.projectName, mode: "insensitive" };
  }

  // Show available + reserved units with their valuation
  const units = await prisma.builtUnit.findMany({
    where: { ...whereClause, status: { in: ["AVAILABLE", "RESERVED"] } },
    select: {
      unitNumber: true,
      unitType: true,
      area: true,
      askingPrice: true,
      currentValuation: true,
      productionCost: true,
      project: { select: { name: true } },
    },
    orderBy: { askingPrice: "desc" },
    take: 10,
  });

  if (units.length === 0) {
    return {
      text: "Koi available/reserved unit nahi hai valuation dikhane ke liye.",
      intent: "UNIT_VALUATION",
      confidence: 0.8,
      cards: [{ type: "link", label: "All units", href: "/m/units" }],
    };
  }

  const typeLabels: Record<string, string> = {
    BHK_1: "1BHK", BHK_2: "2BHK", BHK_3: "3BHK", BHK_4: "4BHK",
    SHOP: "Shop", OFFICE: "Office", VILLA: "Villa",
  };

  let text = `**Unit Valuation (${units.length} available/reserved):**\n\n`;
  for (const u of units.slice(0, 8)) {
    const asking = toNum(u.askingPrice);
    const cost = toNum(u.productionCost);
    const margin = asking > 0 && cost > 0 ? (((asking - cost) / cost) * 100).toFixed(0) : "—";
    text += `• ${u.unitNumber} (${typeLabels[u.unitType] ?? u.unitType}, ${formatNumber(toNum(u.area))} sqft) — ${formatCurrency(asking)} | Cost: ${formatCurrency(cost)} | Margin: ${margin}%\n`;
  }

  const totalAsking = units.reduce((s, u) => s + toNum(u.askingPrice), 0);
  const totalCost = units.reduce((s, u) => s + toNum(u.productionCost), 0);
  text += `\nTotal asking: ${formatCurrency(totalAsking)} | Total cost: ${formatCurrency(totalCost)}`;

  return {
    text,
    intent: "UNIT_VALUATION",
    confidence: 0.9,
    cards: [{ type: "link", label: "All units", href: "/m/units" }],
  };
}

// ── Cost per Sqft — project construction cost per sqft ────────────────────
async function costPerSqftResponse(companyId: string): Promise<AssistantResponse> {
  const projects = await prisma.project.findMany({
    where: { companyId, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
    select: {
      id: true, name: true, type: true,
      totalBudget: true, totalProjectCost: true,
      costPerSqft: true, totalSellableArea: true,
    },
    orderBy: { name: "asc" },
  });

  if (projects.length === 0) {
    return {
      text: "Koi active project nahi hai cost per sqft dikhane ke liye.",
      intent: "COST_PER_SQFT",
      confidence: 0.8,
      cards: [{ type: "link", label: "Projects", href: "/m/projects" }],
    };
  }

  let text = `**Cost per Sqft (Active Projects):**\n\n`;
  for (const p of projects) {
    const cost = toNum(p.totalProjectCost);
    const area = toNum(p.totalSellableArea);
    const cps = toNum(p.costPerSqft);
    const displayCps = cps > 0 ? formatCurrency(cps) : area > 0 ? formatCurrency(cost / area) : "—";
    text += `• ${p.name} — ${displayCps}/sqft | Total: ${formatCurrency(cost)} | Area: ${formatNumber(area)} sqft\n`;
  }

  return {
    text,
    intent: "COST_PER_SQFT",
    confidence: 0.9,
    cards: [{ type: "link", label: "Budget variance", href: "/m/budget-variance" }],
  };
}

// ── Sales Pipeline — booking/deposit/completion stages ────────────────────
async function salesPipelineResponse(companyId: string): Promise<AssistantResponse> {
  const [pending, deposit, completed, cancelled] = await Promise.all([
    prisma.assetSale.count({ where: { companyId, saleStage: "PENDING" } }),
    prisma.assetSale.count({ where: { companyId, saleStage: "DEPOSIT_RECEIVED" } }),
    prisma.assetSale.count({ where: { companyId, saleStage: "COMPLETED" } }),
    prisma.assetSale.count({ where: { companyId, saleStage: "CANCELLED" } }),
  ]);

  // Get deposit amounts with customer names
  const depositSales = await prisma.assetSale.findMany({
    where: { companyId, saleStage: "DEPOSIT_RECEIVED" },
    select: {
      depositAmount: true,
      salePrice: true,
      assetType: true,
      customer: { select: { name: true } },
      builtUnit: { select: { unitNumber: true } },
    },
    take: 5,
  });

  const totalDeposit = depositSales.reduce((s, sale) => s + toNum(sale.depositAmount), 0);
  const totalPendingValue = depositSales.reduce((s, sale) => s + toNum(sale.salePrice), 0);

  let text = `**Sales Pipeline:**\n\n`;
  text += `• Pending (booking nahi hui): ${pending}\n`;
  text += `• Deposit Received (token aaya): ${deposit} — Deposit: ${formatCurrency(totalDeposit)}\n`;
  text += `• Completed (bech gaya): ${completed}\n`;
  text += `• Cancelled: ${cancelled}\n`;

  if (depositSales.length > 0) {
    text += `\n**Deposit wale customers:**\n`;
    for (const s of depositSales.slice(0, 4)) {
      const unitLabel = s.builtUnit?.unitNumber ? ` (${s.builtUnit.unitNumber})` : "";
      text += `• ${s.customer?.name ?? "Unknown"}${unitLabel} — ${formatCurrency(toNum(s.salePrice))} (Deposit: ${formatCurrency(toNum(s.depositAmount))})\n`;
    }
    if (deposit > 0) {
      text += `\n${deposit} customer ne deposit diya hai. ${formatCurrency(totalPendingValue - totalDeposit)} bacha collect karna hai.`;
    }
  }

  return {
    text,
    intent: "SALES_PIPELINE",
    confidence: 0.9,
    cards: [{ type: "link", label: "Sales detail", href: "/m/sales" }],
  };
}

// ── Payment Schedule — installment status ─────────────────────────────────
async function paymentScheduleResponse(companyId: string, entities: ParsedEntities): Promise<AssistantResponse> {
  // Get payment schedule items that are due or partial
  const items = await prisma.paymentScheduleItem.findMany({
    where: {
      paymentSchedule: {
        assetSale: { companyId },
      },
      status: { in: ["DUE", "PARTIAL", "PENDING"] },
    },
    include: {
      paymentSchedule: {
        include: {
          assetSale: {
            select: {
              customer: { select: { name: true } },
              salePrice: true,
              builtUnit: { select: { unitNumber: true } },
            },
          },
        },
      },
    },
    orderBy: { dueDate: "asc" },
    take: 10,
  });

  if (items.length === 0) {
    return {
      text: "Koi pending installment nahi hai. Sab payment collect ho gayi!",
      intent: "PAYMENT_SCHEDULE",
      confidence: 0.9,
    };
  }

  const totalDue = items.reduce((s, i) => s + toNum(i.amount) - toNum(i.paidAmount), 0);

  let text = `**Payment Schedule — Pending Installments (${items.length}):**\n\n`;
  for (const i of items.slice(0, 6)) {
    const due = toNum(i.amount) - toNum(i.paidAmount);
    const buyer = i.paymentSchedule?.assetSale?.customer?.name ?? "Unknown";
    const unit = i.paymentSchedule?.assetSale?.builtUnit?.unitNumber;
    const unitLabel = unit ? ` (${unit})` : "";
    const dueDate = i.dueDate ? i.dueDate.toISOString().split("T")[0] : "N/A";
    text += `• ${buyer}${unitLabel} — ${i.description ?? `Installment ${i.installmentNo}`} | Due: ${formatCurrency(due)} | Date: ${dueDate}\n`;
  }
  text += `\nTotal pending collection: ${formatCurrency(totalDue)}`;

  return {
    text,
    intent: "PAYMENT_SCHEDULE",
    confidence: 0.9,
    cards: [{ type: "link", label: "Sales detail", href: "/m/sales" }],
  };
}

// ── Profit Margin per Project ─────────────────────────────────────────────
async function profitMarginResponse(companyId: string): Promise<AssistantResponse> {
  const projects = await prisma.project.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, totalBudget: true, totalProjectCost: true, totalSellableArea: true },
    orderBy: { name: "asc" },
  });

  if (projects.length === 0) {
    return {
      text: "Koi project nahi hai profit margin dikhane ke liye.",
      intent: "PROFIT_MARGIN",
      confidence: 0.8,
    };
  }

  let text = `**Project Profitability:**\n\n`;

  for (const p of projects.slice(0, 8)) {
    // Get total revenue from completed sales for this project
    const sales = await prisma.assetSale.findMany({
      where: { companyId, projectId: p.id, saleStage: "COMPLETED" },
      select: { salePrice: true },
    });
    const revenue = sales.reduce((s, sale) => s + toNum(sale.salePrice), 0);
    const cost = toNum(p.totalProjectCost);
    const profit = revenue - cost;
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : "—";

    text += `• ${p.name} — Revenue: ${formatCurrency(revenue)} | Cost: ${formatCurrency(cost)} | Profit: ${formatCurrency(profit)} | Margin: ${margin}%\n`;
  }

  return {
    text,
    intent: "PROFIT_MARGIN",
    confidence: 0.9,
    cards: [{ type: "link", label: "P&L detail", href: "/m/gl" }],
  };
}

// ── Available Inventory — what can I sell? ────────────────────────────────
async function availableInventoryResponse(companyId: string): Promise<AssistantResponse> {
  const [availableUnits, availableLand, reservedUnits] = await Promise.all([
    prisma.builtUnit.findMany({
      where: { project: { companyId, deletedAt: null }, status: "AVAILABLE", deletedAt: null },
      select: { unitType: true, area: true, askingPrice: true },
    }),
    prisma.landParcel.findMany({
      where: { landPurchase: { companyId }, status: "AVAILABLE", deletedAt: null, isInfrastructure: false },
      select: { area: true, askingPrice: true, currentValuation: true },
    }),
    prisma.builtUnit.count({
      where: { project: { companyId, deletedAt: null }, status: "RESERVED", deletedAt: null },
    }),
  ]);

  if (availableUnits.length === 0 && availableLand.length === 0) {
    return {
      text: "Kuch bechne ke liye available nahi hai. Sab sold ya under construction hai.",
      intent: "AVAILABLE_INVENTORY",
      confidence: 0.8,
    };
  }

  // Aggregate units by type
  const byType: Record<string, { count: number; totalValue: number; totalArea: number }> = {};
  for (const u of availableUnits) {
    const key = u.unitType;
    if (!byType[key]) byType[key] = { count: 0, totalValue: 0, totalArea: 0 };
    byType[key].count += 1;
    byType[key].totalValue += toNum(u.askingPrice);
    byType[key].totalArea += toNum(u.area);
  }

  const typeLabels: Record<string, string> = {
    BHK_1: "1 BHK", BHK_2: "2 BHK", BHK_3: "3 BHK", BHK_4: "4 BHK",
    SHOP: "Shop", OFFICE: "Office", WAREHOUSE_UNIT: "Warehouse",
    VILLA: "Villa", OTHER: "Other",
  };

  let text = `**Available Inventory (bechne ke liye):**\n\n`;

  if (availableUnits.length > 0) {
    text += `**Units (${availableUnits.length} available${reservedUnits > 0 ? `, ${reservedUnits} reserved` : ""}):**\n`;
    for (const [type, data] of Object.entries(byType)) {
      text += `• ${typeLabels[type] ?? type}: ${data.count} units | ${formatNumber(data.totalArea)} sqft | ${formatCurrency(data.totalValue)}\n`;
    }
  }

  if (availableLand.length > 0) {
    const totalLandArea = availableLand.reduce((s, l) => s + toNum(l.area), 0);
    const totalLandValue = availableLand.reduce((s, l) => s + toNum(l.currentValuation), 0);
    text += `\n**Land Parcels (${availableLand.length} available):**\n`;
    text += `• Total: ${formatNumber(totalLandArea)} sqft | Value: ${formatCurrency(totalLandValue)}\n`;
  }

  const totalValue = availableUnits.reduce((s, u) => s + toNum(u.askingPrice), 0) +
    availableLand.reduce((s, l) => s + toNum(l.currentValuation), 0);
  text += `\nTotal available value: ${formatCurrency(totalValue)}`;

  return {
    text,
    intent: "AVAILABLE_INVENTORY",
    confidence: 0.9,
    cards: [
      { type: "link", label: "Units", href: "/m/units" },
      { type: "link", label: "Land", href: "/m/land" },
    ],
  };
}

// ── Construction Progress ─────────────────────────────────────────────────
async function constructionProgressResponse(companyId: string): Promise<AssistantResponse> {
  const projects = await prisma.project.findMany({
    where: { companyId, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
    select: {
      id: true, name: true, type: true, status: true,
      startDate: true, endDate: true,
      totalBudget: true, totalProjectCost: true, totalSellableArea: true,
    },
    orderBy: { name: "asc" },
  });

  if (projects.length === 0) {
    return {
      text: "Koi active project nahi hai progress dikhane ke liye.",
      intent: "CONSTRUCTION_PROGRESS",
      confidence: 0.8,
    };
  }

  let text = `**Construction Progress:**\n\n`;

  for (const p of projects.slice(0, 6)) {
    // Count units by status for this project
    const units = await prisma.builtUnit.groupBy({
      by: ["status"],
      where: { projectId: p.id, deletedAt: null },
      _count: true,
    });

    const total = units.reduce((s, u) => s + u._count, 0);
    const completed = units.find((u) => u.status === "AVAILABLE" || u.status === "SOLD")?._count ?? 0;
    const underConstruction = units.find((u) => u.status === "UNDER_CONSTRUCTION")?._count ?? 0;
    const planned = units.find((u) => u.status === "PLANNED")?._count ?? 0;
    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    // WBS progress
    const wbsNodes = await prisma.wbsNode.findMany({
      where: { projectId: p.id },
      select: { progressPct: true },
    });
    const avgWbsProgress = wbsNodes.length > 0
      ? Math.round(wbsNodes.reduce((s, n) => s + toNum(n.progressPct), 0) / wbsNodes.length)
      : 0;

    const budget = toNum(p.totalBudget);
    const cost = toNum(p.totalProjectCost);
    const budgetUsed = budget > 0 ? `${Math.round((cost / budget) * 100)}%` : "—";

    text += `• ${p.name} (${p.status})\n`;
    text += `  Units: ${completed}/${total} ready (${progressPct}%) | ${underConstruction} ban rahe | ${planned} pending\n`;
    text += `  WBS Progress: ${avgWbsProgress}% | Budget used: ${budgetUsed}\n`;
  }

  return {
    text,
    intent: "CONSTRUCTION_PROGRESS",
    confidence: 0.9,
    cards: [
      { type: "link", label: "WBS", href: "/m/wbs" },
      { type: "link", label: "DPR", href: "/m/dprs" },
    ],
  };
}
