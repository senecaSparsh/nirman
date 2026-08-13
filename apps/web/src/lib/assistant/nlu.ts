/**
 * Natural Language Understanding for the Owner Assistant ("Sahayak").
 *
 * Supports English, Hindi (romanized), and Hinglish (mixed Hindi+English).
 * Rule-based intent classification + entity extraction — no external AI
 * dependency, works offline, instant response.
 *
 * Intent matching uses keyword scoring: each intent has a set of trigger
 * keywords (English + Hindi romanized). The input is scored against all
 * intents; the highest-scoring intent wins. Entities (numbers, material
 * names, PO numbers, etc.) are extracted via regex.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type Intent =
  | "GREETING"
  | "HELP"
  | "STOCK_QUERY"
  | "LOW_STOCK"
  | "APPROVALS_LIST"
  | "APPROVE_PO"
  | "APPROVE_REQUISITION"
  | "REJECT_PO"
  | "REJECT_REQUISITION"
  | "SALES_LIST"
  | "SALE_CREATE"
  | "PAYMENT_STATUS"
  | "PROJECT_STATUS"
  | "PROJECT_LIST"
  | "CASH_POSITION"
  | "SUPPLIER_PAYABLE"
  | "SUPPLIER_LIST"
  | "ATTENDANCE_TODAY"
  | "CREATE_PO"
  | "CREATE_REQUISITION"
  | "AUTO_REQUISITION"
  | "DPR_LIST"
  | "TRIAL_BALANCE"
  | "EQUIPMENT_STATUS"
  | "EXPENSE_LIST"
  | "TRANSFER_STOCK"
  | "ISSUE_MATERIAL"
  | "TASK_LIST"
  | "WORKER_LIST"
  | "UNKNOWN";

export interface ParsedIntent {
  intent: Intent;
  confidence: number;
  entities: {
    number?: number;
    poNumber?: string;
    reqNumber?: string;
    materialName?: string;
    projectName?: string;
    amount?: number;
    supplierName?: string;
    action?: "approve" | "reject" | "order" | "cancel";
  };
  rawText: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTENT KEYWORDS — English + Hindi (romanized) + Hinglish
// ═══════════════════════════════════════════════════════════════════════════

interface IntentDef {
  intent: Intent;
  keywords: string[];
  weight?: number; // higher = more specific, wins ties
}

const INTENTS: IntentDef[] = [
  // ── Greeting ──────────────────────────────────────────────────────────
  {
    intent: "GREETING",
    keywords: [
      "hello", "hi", "hey", "namaste", "namaskar", "namastey",
      "good morning", "good evening", "good afternoon",
      "suprabhat", "shubh sandhya",
    ],
  },

  // ── Help ──────────────────────────────────────────────────────────────
  {
    intent: "HELP",
    keywords: [
      "help", "madad", "sahayata", "kya kar sakte", "kya kar sakta",
      "what can you do", "commands", "options",
      "kya kya kar sakte ho", "kya hota hai",
    ],
  },

  // ── Stock query ───────────────────────────────────────────────────────
  {
    intent: "STOCK_QUERY",
    keywords: [
      "stock", "inventory", "maal", "saman", "material",
      "kitna stock", "kitna maal", "stock kya hai", "stock dikhao",
      "stock status", "inventory status", "kya hai stock",
      "bhandar", "stock kitna", "material kitna",
      "cement kitna", "steel kitna", "sand kitna", "brick kitna",
      "kitna bacha", "kitna pada hai", "kya pada hai",
    ],
    weight: 2,
  },

  // ── Low stock ─────────────────────────────────────────────────────────
  {
    intent: "LOW_STOCK",
    keywords: [
      "low stock", "low maal", "kam stock", "stock khatam",
      "khatam ho raha", "ending soon", "reorder", "reorder point",
      "min stock", "kam ho raha", "stock neeche", "low inventory",
      "kya khatam ho raha", "kya kam hai", "reorder karna",
      "kam pad gaya", "stock low", "stock kam",
    ],
    weight: 6,
  },

  // ── Approvals list ────────────────────────────────────────────────────
  {
    intent: "APPROVALS_LIST",
    keywords: [
      "approval", "approvals", "pending", "manzoor", "manjur",
      "approve karna", "approve pending", "pending kya hai",
      "kitne pending", "approval queue", "waiting for approval",
      "manzoor kya", "manjur list", "pending list",
      "kya pending hai", "kya approve karna hai",
    ],
    weight: 2,
  },

  // ── Approve PO ────────────────────────────────────────────────────────
  {
    intent: "APPROVE_PO",
    keywords: [
      "po approve", "purchase order approve", "po manzoor",
      "po manjur kar", "approve po", "approve this po",
      "po approve kar", "po approve kar do", "po manzoor kar do",
      "purchase order approve kar", "po pass kar do",
    ],
    weight: 4,
  },

  // ── Approve requisition ───────────────────────────────────────────────
  {
    intent: "APPROVE_REQUISITION",
    keywords: [
      "req approve", "requisition approve", "req manzoor",
      "requisition manzoor", "req manjur kar", "approve req",
      "approve requisition", "req approve kar", "req approve kar do",
      "requisition approve kar", "req pass kar do",
    ],
    weight: 4,
  },

  // ── Reject ────────────────────────────────────────────────────────────
  {
    intent: "REJECT_PO",
    keywords: [
      "po reject", "reject po", "po reject kar", "po reject kar do",
      "purchase order reject", "po mana kar", "po reject kar do",
    ],
    weight: 5,
  },
  {
    intent: "REJECT_REQUISITION",
    keywords: [
      "req reject", "reject req", "requisition reject", "req reject kar",
      "req mana kar", "requisition reject kar", "req reject kar do",
    ],
    weight: 5,
  },

  // ── Sales list ────────────────────────────────────────────────────────
  {
    intent: "SALES_LIST",
    keywords: [
      "sales", "bikri", "bech", "sale dikhao", "bikri dikhao",
      "aaj ki bikri", "aaj ki sales", "recent sales",
      "kitni bikri", "kitni sales", "sales list",
      "bikri kitni", "sale kitni hui", "bikri hui",
      "total sales", "today sales", "sales report",
    ],
    weight: 2,
  },

  // ── Create sale ───────────────────────────────────────────────────────
  {
    intent: "SALE_CREATE",
    keywords: [
      "new sale", "naya sale", "nayi bikri", "sale create",
      "bikri karni hai", "bechna hai", "sell karna",
      "sale banao", "bikri banao", "create sale",
      "new bill", "naya bill", "bill banao", "invoice banao",
    ],
    weight: 3,
  },

  // ── Payment status ────────────────────────────────────────────────────
  {
    intent: "PAYMENT_STATUS",
    keywords: [
      "payment", "paisa aaya", "payment aaya", "payment kitni",
      "paisa kitna aaya", "payment status", "payment received",
      "kitna paisa aaya", "payment pending", "payment baki",
      "udhar", "bakaya", "outstanding", "receivable",
      "payment kitni baki", "paisa baki",
    ],
    weight: 2,
  },

  // ── Project status ────────────────────────────────────────────────────
  {
    intent: "PROJECT_STATUS",
    keywords: [
      "project status", "project kaisa", "project kaisa hai",
      "project kaisa chal raha", "project progress",
      "project update", "project condition",
      "project kya haal", "project ka status",
      "kaisa chal raha hai", "project kya hal",
    ],
    weight: 3,
  },

  // ── Project list ──────────────────────────────────────────────────────
  {
    intent: "PROJECT_LIST",
    keywords: [
      "projects", "project list", "project dikhao",
      "kitne project", "project kitne", "saare project",
      "all projects", "project kya kya", "kaun se project",
    ],
    weight: 2,
  },

  // ── Cash position ─────────────────────────────────────────────────────
  {
    intent: "CASH_POSITION",
    keywords: [
      "cash", "cash position", "paisa kitna hai",
      "bank balance", "cash balance", "kitna paisa",
      "cash kitna", "bank kitna", "paisa kitna bacha",
      "cash in hand", "cash in bank", "fund kitna",
      "total cash", "paisa", "balance kitna",
    ],
    weight: 2,
  },

  // ── Supplier payable ──────────────────────────────────────────────────
  {
    intent: "SUPPLIER_PAYABLE",
    keywords: [
      "supplier ko kitna dena", "payable", "supplier payable",
      "supplier ko dena", "kitna dena hai",
      "supplier payment", "supplier bakaya",
      "udhaar kitna", "supplier ko kitna",
      "kisko kitna dena hai", "payable kitna",
    ],
    weight: 3,
  },

  // ── Supplier list ─────────────────────────────────────────────────────
  {
    intent: "SUPPLIER_LIST",
    keywords: [
      "suppliers", "supplier list", "supplier dikhao",
      "vendor", "vendor list", "vendor dikhao",
      "kitne supplier", "supplier kaun", "supplier kya kya",
    ],
    weight: 2,
  },

  // ── Attendance today ──────────────────────────────────────────────────
  {
    intent: "ATTENDANCE_TODAY",
    keywords: [
      "attendance", "worker kitne", "mazdoor kitne",
      "aaj kitne aaye", "aaj attendance",
      "kitne worker aaye", "labour kitne",
      "kamgar kitne", "aaj ka attendance",
      "present kitne", "absent kitne",
      "attendance dikhao", "attendance status",
    ],
    weight: 2,
  },

  // ── Create PO ─────────────────────────────────────────────────────────
  {
    intent: "CREATE_PO",
    keywords: [
      "new po", "naya po", "po banao", "purchase order banao",
      "create po", "po create", "naya purchase order",
      "po banani hai", "order banao", "purchase order create",
      "po karo", "po place karo",
    ],
    weight: 3,
  },

  // ── Create requisition ────────────────────────────────────────────────
  {
    intent: "CREATE_REQUISITION",
    keywords: [
      "new req", "naya req", "req banao", "requisition banao",
      "create requisition", "nayi requisition",
      "maal mangwao", "material mangwao",
      "req banani hai", "requisition create",
      "material chahiye", "maal chahiye",
    ],
    weight: 3,
  },

  // ── Auto requisition ──────────────────────────────────────────────────
  {
    intent: "AUTO_REQUISITION",
    keywords: [
      "auto requisition", "auto req", "auto generate",
      "requisition auto", "req auto", "automatically req",
      "auto maal mangwao", "auto generate req",
      "reorder auto", "auto create requisition",
    ],
    weight: 4,
  },

  // ── DPR list ──────────────────────────────────────────────────────────
  {
    intent: "DPR_LIST",
    keywords: [
      "dpr", "daily report", "daily progress",
      "progress report", "dpr dikhao", "dpr list",
      "aaj ka dpr", "daily report dikhao",
      "progress dikhao", "site report",
      "dpr pending", "dpr status",
    ],
    weight: 2,
  },

  // ── Trial balance ─────────────────────────────────────────────────────
  {
    intent: "TRIAL_BALANCE",
    keywords: [
      "trial balance", "balance sheet", "gl", "general ledger",
      "ledger", "books", "hisab", "hisab kitab",
      "trial balance dikhao", "balance sheet dikhao",
      "gl dikhao", "ledger dikhao", "books dikhao",
      "p&l", "profit loss", "profit and loss",
      "income statement", "natija", "labh hani",
    ],
    weight: 3,
  },

  // ── Equipment status ──────────────────────────────────────────────────
  {
    intent: "EQUIPMENT_STATUS",
    keywords: [
      "equipment", "machine", "machinery", "tool",
      "equipment status", "machine status",
      "equipment kaisa", "machine kaisa",
      "equipment dikhao", "machine dikhao",
      "kaun sa equipment", "kitne equipment",
      "yaan", "jantra",
    ],
    weight: 2,
  },

  // ── Expense list ──────────────────────────────────────────────────────
  {
    intent: "EXPENSE_LIST",
    keywords: [
      "expense", "expenses", "kharcha", "kharch",
      "kharcha dikhao", "expense dikhao",
      "kitna kharcha", "expenses list",
      "aaj ka kharcha", "recent expenses",
      "kharch hua", "expense hua",
    ],
    weight: 2,
  },

  // ── Transfer stock ────────────────────────────────────────────────────
  {
    intent: "TRANSFER_STOCK",
    keywords: [
      "transfer", "stock transfer", "maal bhejo",
      "transfer karo", "stock bhejo",
      "material transfer", "ek jagah se doosri",
      "shift karo", "relocate",
    ],
    weight: 3,
  },

  // ── Issue material ────────────────────────────────────────────────────
  {
    intent: "ISSUE_MATERIAL",
    keywords: [
      "issue", "issue material", "material issue",
      "maal issue karo", "project ko maal do",
      "site ko material do", "issue karo",
      "material bhejo site", "issue stock",
    ],
    weight: 3,
  },

  // ── Task list ─────────────────────────────────────────────────────────
  {
    intent: "TASK_LIST",
    keywords: [
      "task", "tasks", "kaam", "kaam list",
      "task list", "task dikhao", "kaam dikhao",
      "pending task", "pending kaam",
      "kitne kaam", "task pending",
      "my tasks", "mere kaam",
    ],
    weight: 2,
  },

  // ── Worker list ───────────────────────────────────────────────────────
  {
    intent: "WORKER_LIST",
    keywords: [
      "workers", "worker list", "mazdoor list",
      "labour list", "kamgar list",
      "kitne worker", "worker dikhao",
      "employees", "employee list",
      "staff", "staff list",
    ],
    weight: 2,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

function extractEntities(text: string): ParsedIntent["entities"] {
  const entities: ParsedIntent["entities"] = {};
  const lower = text.toLowerCase();

  // ── PO number (e.g., PO-20260812-0011, PO-0011, po 11) ──
  const poMatch = text.match(/PO[-\s]?(\d{4,})/i);
  if (poMatch) {
    entities.poNumber = poMatch[0].replace(/\s+/g, "").toUpperCase();
  }

  // ── Requisition number (e.g., REQ-2024-0007, REQ-0007, req 7) ──
  const reqMatch = text.match(/REQ[-\s]?(\d{4,})/i);
  if (reqMatch) {
    entities.reqNumber = reqMatch[0].replace(/\s+/g, "").toUpperCase();
  }

  // ── Amount (e.g., 5000, 5000 ka, 5000 rupaye, ₹5000) ──
  const amountMatch = text.match(/(?:₹|rs\.?|rupaye|rupees)?\s*(\d[\d,]+)\s*(?:ka|ki|ke|rupaye|rupees|rs\.?|ki?m?li?ne?|ka?i?se?|me|ka|ki?)/i);
  if (amountMatch && amountMatch[1]) {
    const amt = parseInt(amountMatch[1].replace(/,/g, ""), 10);
    if (amt > 0) entities.amount = amt;
  }
  // Fallback: just find a standalone number
  if (!entities.amount) {
    const numMatch = text.match(/\b(\d[\d,]+)\b/);
    if (numMatch && numMatch[1]) {
      const n = parseInt(numMatch[1].replace(/,/g, ""), 10);
      if (n > 0) entities.number = n;
    }
  } else {
    entities.number = entities.amount;
  }

  // ── Action: approve / reject ──
  if (/\b(approve|manzoor|manjur|pass|accept|okay|ok)\b/i.test(lower)) {
    entities.action = "approve";
  } else if (/\b(reject|mana|reject kar|decline|reject kar do|na)\b/i.test(lower)) {
    entities.action = "reject";
  } else if (/\b(order|place|order kar)\b/i.test(lower)) {
    entities.action = "order";
  } else if (/\b(cancel|cancel kar|cancel kar do|rad|rad kar)\b/i.test(lower)) {
    entities.action = "cancel";
  }

  // ── Material name (common construction materials) ──
  const materials = [
    "cement", "steel", "sand", "brick", "aggregate", "stone",
    "wood", "timber", "plywood", "paint", "pipe", "wire",
    "cable", "glass", "tile", "marble", "granite",
    "sariya", "cement", "reti", "eent", "pathar",
    "lakdi", "paint", "nali", "taar",
  ];
  for (const m of materials) {
    if (lower.includes(m)) {
      entities.materialName = m;
      break;
    }
  }

  // ── Project name (quoted or after "project") ──
  const projMatch = text.match(/project\s+["']?([a-zA-Z\s]{3,30})["']?/i);
  if (projMatch && projMatch[1]) {
    entities.projectName = projMatch[1].trim();
  }

  return entities;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTENT CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════

export function parseIntent(rawText: string): ParsedIntent {
  const text = rawText.toLowerCase().trim();
  const entities = extractEntities(rawText);

  // Score each intent
  let bestIntent: Intent = "UNKNOWN";
  let bestScore = 0;

  for (const def of INTENTS) {
    let score = 0;
    for (const kw of def.keywords) {
      if (text.includes(kw.toLowerCase())) {
        // Longer keyword matches get higher score (more specific)
        score += kw.length * 0.1 + 1;
      }
    }
    // Apply weight multiplier
    score *= def.weight ?? 1;

    if (score > bestScore) {
      bestScore = score;
      bestIntent = def.intent;
    }
  }

  // ── Special handling: "approve" with PO number ──
  if (entities.poNumber && entities.action === "approve") {
    bestIntent = "APPROVE_PO";
    bestScore = Math.max(bestScore, 10);
  } else if (entities.reqNumber && entities.action === "approve") {
    bestIntent = "APPROVE_REQUISITION";
    bestScore = Math.max(bestScore, 10);
  } else if (entities.poNumber && entities.action === "reject") {
    bestIntent = "REJECT_PO";
    bestScore = Math.max(bestScore, 10);
  } else if (entities.reqNumber && entities.action === "reject") {
    bestIntent = "REJECT_REQUISITION";
    bestScore = Math.max(bestScore, 10);
  }

  // ── Confidence: normalize score ──
  const confidence = bestScore === 0 ? 0 : Math.min(bestScore / 10, 1);

  return {
    intent: bestIntent,
    confidence,
    entities,
    rawText,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUGGESTION CHIPS — quick prompts for the user
// ═══════════════════════════════════════════════════════════════════════════

export const SUGGESTION_CHIPS = [
  { label: "Stock kya hai?", text: "stock kya hai" },
  { label: "Approvals pending?", text: "approvals pending kya hai" },
  { label: "Aaj ki sales", text: "aaj ki sales dikhao" },
  { label: "Cash position", text: "cash position kya hai" },
  { label: "Supplier ko kitna dena?", text: "supplier ko kitna dena hai" },
  { label: "Low stock kya hai?", text: "low stock kya hai" },
  { label: "Project status", text: "project status dikhao" },
  { label: "Aaj attendance", text: "aaj kitne worker aaye" },
  { label: "Trial balance", text: "trial balance dikhao" },
  { label: "DPR pending", text: "dpr pending kitne hai" },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELP TEXT
// ═══════════════════════════════════════════════════════════════════════════

export const HELP_TEXT = `Main ye sab kar sakta hoon:

📊 **Stock & Inventory**
• "Stock kya hai?" — current stock dekho
• "Low stock kya hai?" — kya khatam ho raha hai
• "Cement kitna hai?" — specific material check

✅ **Approvals**
• "Approvals pending?" — pending list
• "PO-0011 approve kar" — specific PO approve
• "REQ-0007 approve kar" — requisition approve

💰 **Sales & Payment**
• "Aaj ki sales" — recent sales
• "Payment kitni aayi?" — payment status
• "Naya sale banao" — create sale

🏗️ **Projects**
• "Project status" — all projects
• "DPR pending" — daily reports

💵 **Finance**
• "Cash position" — cash & bank balance
• "Trial balance" — GL summary
• "Supplier ko kitna dena?" — payables

👷 **Site & Workers**
• "Aaj kitne worker aaye?" — attendance
• "Auto requisition chala" — auto-generate req

Bolo ya type karo — Hindi, English, ya dono mila ke! 🎤`;
