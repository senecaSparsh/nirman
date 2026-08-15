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
  | "ATTENTION"
  | "MONTHLY_SUMMARY"
  | "PROFIT_LOSS"
  | "SPEND_ANALYSIS"
  | "APPROVE_ALL"
  | "SUPPLIER_PAYMENT"
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
    customerName?: string;
    quantity?: number;
    unit?: string;
    unitPrice?: number;
    action?: "approve" | "reject" | "order" | "cancel";
    ordinal?: number; // "first", "second", "pehla", "doosra" → 1, 2
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

  // ── Attention / what needs me ─────────────────────────────────────────
  {
    intent: "ATTENTION",
    keywords: [
      "attention", "kya karna hai", "kya important hai",
      "what needs me", "kya mere liye hai",
      "kya pending hai", "sab pending", "kya karu",
      "kya handle karna hai", "kya focus karna",
      "priority", "urgent kya hai", "kya urgent",
    ],
    weight: 3,
  },

  // ── Monthly summary ───────────────────────────────────────────────────
  {
    intent: "MONTHLY_SUMMARY",
    keywords: [
      "monthly summary", "mahine ka summary", "mahine ka hisab",
      "this month", "is mahine", "month summary",
      "mahine ka report", "monthly report",
      "is mahine kitni", "is mahine kya hua",
      "month ka status", "mahine ka status",
    ],
    weight: 4,
  },

  // ── Profit & Loss ─────────────────────────────────────────────────────
  {
    intent: "PROFIT_LOSS",
    keywords: [
      "profit loss", "p&l", "pnl", "profit and loss",
      "labh hani", "labh", "profit kitna",
      "loss kitna", "net profit", "gross profit",
      "margin kitna", "profitability",
      "kamaai kitni", "nuksan kitna",
    ],
    weight: 4,
  },

  // ── Spend analysis ────────────────────────────────────────────────────
  {
    intent: "SPEND_ANALYSIS",
    keywords: [
      "spend", "spending", "kharcha kitna hua",
      "kitna kharcha", "expense analysis",
      "kis par kharcha", "kya kharcha hua",
      "spend analysis", "cost analysis",
      "kharcha breakdown", "kahan kharcha hua",
      "cement par kitna", "steel par kitna",
      "material par kitna", "labour par kitna",
    ],
    weight: 3,
  },

  // ── Approve all ───────────────────────────────────────────────────────
  {
    intent: "APPROVE_ALL",
    keywords: [
      "approve all", "sab approve kar", "sab manzoor kar",
      "approve kar do sab", "sab pass kar do",
      "all pending approve", "sab approve",
      "sab approve kar do", "approve everything",
    ],
    weight: 5,
  },

  // ── Supplier payment ──────────────────────────────────────────────────
  {
    intent: "SUPPLIER_PAYMENT",
    keywords: [
      "supplier ko pay karo", "supplier payment karo",
      "pay supplier", "supplier ko paisa do",
      "payment bhejo supplier", "supplier ko dena",
      "make payment", "pay karna", "pay kar",
      "supplier ko pay kar", "pay kar do",
    ],
    weight: 4,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

const HINDI_NUMBERS: Record<string, number> = {
  // ones
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhah: 6, chhe: 6, saat: 7, aath: 8, nau: 9, no: 9,
  // tens
  das: 10, gyaarah: 11, gyarah: 11, baarah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17, athaarah: 18, unnees: 19, unnis: 19,
  bees: 20, tees: 30, chaalis: 40, chalis: 40, pachaas: 50, pachas: 50, saath: 60, sattar: 70, assi: 80, asi: 80, nabbe: 90,
  // scale words (multipliers)
  sau: 100, hazaar: 1000, hazar: 1000, lakh: 100000, lac: 100000, crore: 10000000,
  // English number words
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000,
};

const SCALE_WORDS = new Set(["sau", "hazaar", "hazar", "lakh", "lac", "crore", "hundred", "thousand"]);

/**
 * Parse Hindi/Hinglish number words to digits.
 * Handles compound expressions: "pachaas hazaar" → 50000, "do lakh" → 200000,
 * "sau" → 100, "pachaas" → 50.
 */
function parseHindiNumber(text: string): number | null {
  const words = text.split(/\s+/);
  let total = 0;
  let current = 0;
  let found = false;

  for (const word of words) {
    const clean = word.replace(/[^a-z]/g, "");
    const val = HINDI_NUMBERS[clean];
    if (val == null) {
      // Flush current into total if we were building a number
      total += current;
      current = 0;
      continue;
    }

    found = true;
    if (SCALE_WORDS.has(clean)) {
      // Multiply current by scale, or add scale directly if no current
      if (current > 0) {
        total += current * val;
        current = 0;
      } else {
        total += val;
      }
    } else {
      current += val;
    }
  }
  // Flush remaining
  total += current;

  return found ? total : null;
}

// ── Ordinal extraction ("first one", "pehla", "doosra") ───────────────────
const ORDINALS: Record<string, number> = {
  pehla: 1, pehli: 1, pehle: 1, first: 1,
  doosra: 2, doosri: 2, second: 2,
  teesra: 3, teesri: 3, third: 3,
  chautha: 4, chauthi: 4, fourth: 4,
  panchwa: 5, panchwi: 5, fifth: 5,
};

function extractOrdinal(text: string): number | undefined {
  const lower = text.toLowerCase();
  for (const [word, num] of Object.entries(ORDINALS)) {
    if (lower.includes(word)) return num;
  }
  return undefined;
}

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

  // ── Hindi number words → digits ──
  const hindiNumber = parseHindiNumber(lower);
  if (hindiNumber != null) {
    entities.amount = hindiNumber;
    entities.number = hindiNumber;
  }

  // ── Amount (e.g., 5000, 5000 ka, 5000 rupaye, ₹5000) ──
  if (!entities.amount) {
    const amountMatch = text.match(/(?:₹|rs\.?|rupaye|rupees)?\s*(\d[\d,]+)\s*(?:ka|ki|ke|rupaye|rupees|rs\.?|ki?m?li?ne?|ka?i?se?|me|ka|ki?)/i);
    if (amountMatch && amountMatch[1]) {
      const amt = parseInt(amountMatch[1].replace(/,/g, ""), 10);
      if (amt > 0) entities.amount = amt;
    }
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
  // Hindi aliases map to English search terms that match DB names
  const materialAliases: Record<string, string> = {
    cement: "cement",
    steel: "steel",
    sariya: "steel", // Hindi: sariya = steel rebar
    sand: "sand",
    reti: "sand", // Hindi: reti = sand
    brick: "brick",
    eent: "brick", // Hindi: eent = brick
    aggregate: "aggregate",
    stone: "stone",
    pathar: "stone", // Hindi: pathar = stone
    wood: "wood",
    timber: "timber",
    lakdi: "timber", // Hindi: lakdi = wood
    plywood: "plywood",
    paint: "paint",
    pipe: "pipe",
    nali: "pipe", // Hindi: nali = pipe/drain
    wire: "wire",
    taar: "wire", // Hindi: taar = wire
    cable: "cable",
    glass: "glass",
    tile: "tile",
    marble: "marble",
    granite: "granite",
  };
  for (const [alias, dbTerm] of Object.entries(materialAliases)) {
    if (lower.includes(alias)) {
      entities.materialName = dbTerm;
      break;
    }
  }

  // ── Project name (quoted or after "project") ──
  const projMatch = text.match(/project\s+["']?([a-zA-Z\s]{3,30})["']?/i);
  if (projMatch && projMatch[1]) {
    entities.projectName = projMatch[1].trim();
  }

  // ── Ordinal ("first one", "pehla", "doosra") ──
  entities.ordinal = extractOrdinal(text);

  // ── Quantity + unit ("5 bag", "10 kg", "pachaas cft") ──
  const qtyMatch = text.match(/(\d+)\s*(bag|bags|kg|kgs|nos|cft|mtr|ton|tonnes|litre|litres|lt|box|boxes|piece|pieces|pcs|set|sets|roll|rolls|feet|ft)/i);
  if (qtyMatch && qtyMatch[1]) {
    entities.quantity = parseInt(qtyMatch[1], 10);
    entities.unit = qtyMatch[2]?.toUpperCase().replace(/S$/, "");
  }

  // ── Unit price ("@ 500", "rate 500", "500 per", "500 ka") ──
  const priceMatch = text.match(/(?:@|rate|per|ka|ki)\s*(\d[\d,]+)/i);
  if (priceMatch && priceMatch[1]) {
    entities.unitPrice = parseInt(priceMatch[1].replace(/,/g, ""), 10);
  }

  // ── Customer name (after "customer" or "party") ──
  const custMatch = text.match(/(?:customer|party|grahak)\s+["']?([a-zA-Z\s]{3,30})["']?/i);
  if (custMatch && custMatch[1]) {
    entities.customerName = custMatch[1].trim();
  }

  // ── Supplier name (after "supplier" or "vendor") ──
  const supMatch = text.match(/(?:supplier|vendor)\s+["']?([a-zA-Z\s]{3,30})["']?/i);
  if (supMatch && supMatch[1]) {
    entities.supplierName = supMatch[1].trim();
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

  // ── "approve" with ordinal ("pehla wala approve kar") → APPROVE_PO ──
  if (entities.action === "approve" && entities.ordinal && bestIntent === "UNKNOWN") {
    bestIntent = "APPROVE_PO";
    bestScore = 8;
  }

  // ── Fallback: if a material name is found but no intent matched, treat as stock query ──
  if (bestIntent === "UNKNOWN" && entities.materialName) {
    bestIntent = "STOCK_QUERY";
    bestScore = 5;
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
  { label: "Kya karu?", text: "kya karna hai" },
  { label: "Stock kya hai?", text: "stock kya hai" },
  { label: "Approvals pending?", text: "approvals pending kya hai" },
  { label: "Aaj ki sales", text: "aaj ki sales dikhao" },
  { label: "Cash position", text: "cash position kya hai" },
  { label: "Supplier ko kitna dena?", text: "supplier ko kitna dena hai" },
  { label: "Low stock kya hai?", text: "low stock kya hai" },
  { label: "Profit kitna?", text: "profit kitna hua" },
  { label: "Is mahine ka summary", text: "is mahine ka summary" },
  { label: "Cement par kitna kharcha?", text: "cement par kitna kharcha hua" },
  { label: "Aaj attendance", text: "aaj kitne worker aaye" },
  { label: "Trial balance", text: "trial balance dikhao" },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELP TEXT
// ═══════════════════════════════════════════════════════════════════════════

export const HELP_TEXT = `Main ye sab kar sakta hoon:

📊 **Stock & Inventory**
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

Bolo ya type karo — Hindi, English, ya dono! 🎤`;
