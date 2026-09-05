/**
 * Enhanced NLU Matching Engine for the Owner Assistant ("Sahayak").
 *
 * This module provides LLM-like understanding without an external AI dependency.
 * It replaces naive substring matching with:
 *
 * 1. **Tokenization** — word-boundary aware matching (no more "po" matching "position")
 * 2. **Fuzzy matching** — Levenshtein distance tolerates typos ("stok" → "stock")
 * 3. **Synonym clusters** — semantic groups (dikhao/batao/dekho/show = "display")
 * 4. **Action + Subject decomposition** — understands "create sale" as CREATE + SALE,
 *    not just a keyword hit. This is the key to generalization.
 * 5. **Negation detection** — "stock nahi dikhao" doesn't match STOCK_QUERY
 * 6. **Stemming/light normalization** — "approved"/"approving"/"approves" → "approve"
 * 7. **Confidence scoring** — based on coverage ratio, not raw score
 *
 * The engine is pure (no side effects, no I/O) and instant (< 1ms per query).
 */

// ═══════════════════════════════════════════════════════════════════════════
// TOKENIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tokenize input text into normalized word tokens.
 * Strips punctuation, lowercases, splits on whitespace.
 * Preserves order for phrase matching.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[?!,.।;:'"`(){}[\]/\\|_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 0);
}

/**
 * Light stemmer — normalizes common English/Hindi verb forms.
 * "approved" → "approve", "creating" → "create", "banao" → "bana"
 * This is NOT a full stemmer — just handles the most common suffixes.
 */
export function stem(token: string): string {
  // English suffixes
  if (token.length > 5) {
    if (token.endsWith("ing")) return token.slice(0, -3);
    if (token.endsWith("ied")) return token.slice(0, -3) + "y";
    if (token.endsWith("ied")) return token.slice(0, -3) + "y";
    if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
    if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
    if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
  }
  // Hindi verb suffixes — "banao" → "bana", "dikhao" → "dikha"
  if (token.length > 4) {
    if (token.endsWith("nao")) return token.slice(0, -2);
    if (token.endsWith("rao")) return token.slice(0, -2);
    if (token.endsWith("raha")) return token.slice(0, -4);
    if (token.endsWith("rahi")) return token.slice(0, -4);
    if (token.endsWith("raha")) return token.slice(0, -4);
  }
  return token;
}

/**
 * Tokenize and stem in one step.
 */
export function tokenizeStemmed(text: string): string[] {
  return tokenize(text).map(stem);
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVENSHTEIN DISTANCE — for fuzzy matching
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute Levenshtein edit distance between two strings.
 * Used for typo-tolerant matching.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use the shorter string as the row for memory efficiency
  if (a.length > b.length) [a, b] = [b, a];

  const aLen = a.length;
  const bLen = b.length;
  let prev = new Array<number>(aLen + 1);
  let curr = new Array<number>(aLen + 1);

  for (let i = 0; i <= aLen; i++) prev[i] = i;

  for (let j = 1; j <= bLen; j++) {
    curr[0] = j;
    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i]! + 1,        // deletion
        curr[i - 1]! + 1,    // insertion
        prev[i - 1]! + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[aLen]!;
}

/**
 * Fuzzy match threshold — how many edits are tolerated.
 * Scales with word length: longer words tolerate more edits.
 */
function fuzzyThreshold(wordLen: number): number {
  if (wordLen <= 3) return 0; // No fuzzy for short words (too many false positives)
  if (wordLen <= 5) return 1;
  if (wordLen <= 8) return 2;
  return 3;
}

/**
 * Check if a token matches a target word, with optional fuzzy matching.
 * Both are pre-stemmed.
 */
export function fuzzyTokenMatch(token: string, target: string): boolean {
  if (token === target) return true;
  if (token.length <= 2 || target.length <= 2) return token === target;

  // Check prefix match (first 3+ chars) — handles many verb forms
  const minLen = Math.min(token.length, target.length);
  if (minLen >= 4 && token.slice(0, minLen) === target.slice(0, minLen)) {
    return true;
  }

  // Fuzzy match via Levenshtein
  const threshold = fuzzyThreshold(Math.max(token.length, target.length));
  if (threshold > 0) {
    return levenshtein(token, target) <= threshold;
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNONYM CLUSTERS — semantic groups for action + subject decomposition
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Action verb synonym clusters.
 * Each cluster maps to a canonical action.
 * These are stemmed for matching.
 */
export const ACTION_SYNONYMS: Record<string, string[]> = {
  SHOW: [
    "dikhao", "dikha", "dikha", "batao", "bata", "dekho", "dekh", "dekhao",
    "show", "display", "list", "kya", "kitna", "kitni", "kitne", "status",
    "check", "dekhlo", "dekho", "batao", "kaisa", "kaisi", "kya hai",
    "kholo", "khol", "chalao", "chala", "open", "view", "see",
    "batado", "bata do", "dikha do", "dekh lo", "khol do",
  ],
  CREATE: [
    "banao", "bana", "create", "add", "daal", "naya", "nayi", "nav",
    "create kar", "add kar", "bana do", "daal do", "add kar do",
    "new", "register", "entry", "enter", "insert", "jama",
    "laga", "laga do", "record", "log", "post",
  ],
  APPROVE: [
    "approve", "manzoor", "manjur", "pass", "accept", "ok", "okay",
    "confirm", "clear", "yes", "haan", "green", "manjur kar",
    "approve kar", "pass kar", "clear kar", "ok kar",
  ],
  REJECT: [
    "reject", "mana", "decline", "cancel", "rad", "mana kar",
    "reject kar", "no", "nahi", "deny", "veto",
  ],
  PAY: [
    "pay", "payment", "paisa", "dena", "bhejo", "pay kar",
    "pay kar do", "de do", "transfer kar", "remittance",
    "jama kar", "deposit",
  ],
  ISSUE: [
    "issue", "bhejo", "nikal", "nikalo", "issue kar",
    "material do", "site ko do", "challan", "gate pass",
    "dispatch", "release",
  ],
  TRANSFER: [
    "transfer", "shift", "bhejo", "move", "transfer kar",
    "relocate", "ek jagah se doosri",
  ],
  RECEIVE: [
    "receive", "aaya", "aaye", "mil", "mila", "receive kar",
    "grn", "goods receipt", "entry kiya", "accept delivery",
    "samay", "maal aaya", "receive kar lo",
  ],
  DELETE: [
    "delete", "hatao", "hatado", "remove", "delete kar",
    "hata do", "nikalo", "clear kar", "archive",
  ],
  EDIT: [
    "edit", "change", "badlo", "badal", "update", "modify",
    "edit kar", "update kar", "change kar", "badal do",
    "correct", "fix", "adjust",
  ],
};

/**
 * Domain subject synonym clusters.
 * Each cluster maps to a canonical subject.
 */
export const SUBJECT_SYNONYMS: Record<string, string[]> = {
  STOCK: [
    "stock", "inventory", "maal", "saman", "material", "bhandar",
    "bhandar", "items", "godam", "godi", "warehouse", "store",
  ],
  SALE: [
    "sale", "sales", "bikri", "bech", "bechna", "bill", "invoice",
    "bikri", "deal", "sell",
  ],
  PO: [
    "po", "purchase", "purchase order", "kharid", "kharidi",
    "order", "purchase order",
  ],
  REQUISITION: [
    "req", "requisition", "demand", "mangwao", "mang",
    "requirement", "indent",
  ],
  APPROVAL: [
    "approval", "approvals", "pending", "manzoor", "manjur",
    "approve", "waiting", "queue",
  ],
  PROJECT: [
    "project", "prakalp", "site", "kaam", "construction",
    "building", "tower", "wing",
  ],
  SUPPLIER: [
    "supplier", "vendor", "supplier", "thekedar", "thekedaar",
    "merchant", "dealer", "distributor",
  ],
  CUSTOMER: [
    "customer", "grahak", "client", "party", "buyer",
    "grahak", "customer",
  ],
  CASH: [
    "cash", "paisa", "bank", "balance", "fund", "rupaya",
    "paise", "account",
  ],
  ATTENDANCE: [
    "attendance", "hazri", "haazri", "present", "absent",
    "checkin", "check-in", "aaye", "mazdoor", "worker",
  ],
  DPR: [
    "dpr", "daily report", "daily progress", "progress report",
    "site report",
  ],
  EXPENSE: [
    "expense", "expenses", "kharcha", "kharch", "spend",
    "spending", "cost",
  ],
  EQUIPMENT: [
    "equipment", "machine", "machinery", "tool", "yaan",
    "jantra", "tools",
  ],
  TASK: [
    "task", "tasks", "kaam", "todo", "work", "assignment",
  ],
  WORKER: [
    "worker", "workers", "mazdoor", "labour", "labor",
    "kamgar", "employee", "staff", "employee",
  ],
  LAND: [
    "land", "zameen", "zamin", "plot", "parcel", "property",
    "real estate",
  ],
  UNIT: [
    "unit", "flat", "apartment", "shop", "office", "villa",
    "ghar", "house",
  ],
  BROKER: [
    "broker", "agent", "commission", "dalal", "middleman",
  ],
  TENANCY: [
    "tenancy", "rent", "rental", "kiraya", "tenant", "tenant",
    "lease", "bhada",
  ],
  LEAD: [
    "lead", "leads", "prospect", "inquiry", "enquiry",
    "query", "interest",
  ],
  WORK_ORDER: [
    "work order", "wo", "subcontractor", "thekedaar",
    "contractor work", "subcontract",
  ],
  BOQ: [
    "boq", "bill of quantities", "bill of quantity",
    "quantity survey", "qs",
  ],
  WBS: [
    "wbs", "work breakdown", "task breakdown",
  ],
  BUDGET: [
    "budget", "variance", "budget variance", "budget vs actual",
  ],
  PAYROLL: [
    "payroll", "salary", "tankhwa", "wages", "mazdoori",
  ],
  SCRAP: [
    "scrap", "kabad", "waste", "waste material",
  ],
  PORTAL: [
    "portal", "listing", "99acres", "magicbricks", "housing",
    "online listing",
  ],
  TALLY: [
    "tally", "tally sync", "sync",
  ],
  TRIAL_BALANCE: [
    "trial balance", "balance sheet", "gl", "general ledger",
    "ledger", "books", "hisab", "hisab kitab",
  ],
  PROFIT_LOSS: [
    "profit loss", "p&l", "pnl", "profit and loss", "labh hani",
    "income statement", "natija",
  ],
  PORTFOLIO: [
    "portfolio", "business", "company overview", "cockpit",
    "net worth", "total value",
  ],
  PAYMENT: [
    "payment", "paisa aaya", "collection", "installment",
    "due", "baki", "bakaya", "outstanding", "receivable",
  ],
  MATERIAL: [
    "material", "saman", "item", "maal", "cement", "steel",
    "sand", "brick", "sariya", "reti", "eent",
  ],
  QUOTATION: [
    "quotation", "quote", "quotes", "estimate", "tender",
    "offer", "quotation",
  ],
  GATE_PASS: [
    "gate pass", "gate entry", "challan", "pass",
  ],
  GOODS_RECEIPT: [
    "grn", "goods receipt", "receipt", "receive", "maal aaya",
    "delivery",
  ],
  DIRECT_PURCHASE: [
    "direct purchase", "cash purchase", "spot purchase",
    "direct kharid",
  ],
  SUPPLIER_INVOICE: [
    "supplier invoice", "bill aaya", "invoice aaya",
    "vendor bill", "bill receive",
  ],
  VEHICLE: [
    "vehicle", "gadi", "gaadi", "truck", "car", "van",
    "tempo", "vehicle",
  ],
  SAFETY: [
    "safety", "incident", "hazard", "inspection", "accident",
    "near miss",
  ],
  QUALITY: [
    "quality", "ncr", "capa", "defect", "non-conformance",
    "quality control",
  ],
  LEAVE: [
    "leave", "chutti", "absence", "off", "leave request",
  ],
  DEPARTMENT: [
    "department", "vibhag", "dept", "division",
  ],
  CHANGE_ORDER: [
    "change order", "variation", "extra work", "change",
  ],
  RA_BILL: [
    "ra bill", "running account", "running bill",
    "contractor bill", "mb bill",
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// NEGATION DETECTION
// ═══════════════════════════════════════════════════════════════════════════

const NEGATION_WORDS = new Set([
  "nahi", "na", "no", "not", "mat", "never", "nahi hai",
  "nahi chahiye", "cancel", "skip", "band",
]);

/**
 * Detect if a token is a negation word.
 */
export function isNegation(token: string): boolean {
  return NEGATION_WORDS.has(token.toLowerCase());
}

/**
 * Check if a keyword match is negated by a preceding negation word.
 * Looks at the 2 tokens before the match position.
 */
export function isNegatedContext(tokens: string[], matchIndex: number): boolean {
  // Check up to 2 tokens before the match
  for (let i = Math.max(0, matchIndex - 2); i < matchIndex; i++) {
    if (isNegation(tokens[i]!)) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION + SUBJECT DECOMPOSITION
// ═══════════════════════════════════════════════════════════════════════════

export interface DecomposedQuery {
  action: string | null;
  subject: string | null;
  actionConfidence: number;
  subjectConfidence: number;
}

/**
 * Decompose a query into action + subject using synonym clusters.
 * This is the "understanding" layer — it identifies WHAT the user wants to do
 * and WHAT they want to do it to, independent of specific keyword patterns.
 *
 * Example: "naya supplier banao" → action=CREATE, subject=SUPPLIER
 *          "stock dikhao"         → action=SHOW, subject=STOCK
 *          "PO-0011 approve kar"  → action=APPROVE, subject=PO (from PO number)
 */
export function decomposeQuery(text: string): DecomposedQuery {
  const tokens = tokenizeStemmed(text);

  let bestAction: string | null = null;
  let bestActionScore = 0;
  let bestSubject: string | null = null;
  let bestSubjectScore = 0;

  // ── Detect action ──
  for (const [action, synonyms] of Object.entries(ACTION_SYNONYMS)) {
    let score = 0;
    for (const syn of synonyms) {
      const synTokens = tokenizeStemmed(syn);
      if (synTokens.length === 1) {
        // Single-word synonym: check each token
        for (let i = 0; i < tokens.length; i++) {
          if (fuzzyTokenMatch(tokens[i]!, synTokens[0]!)) {
            // Check negation — but only negate SHOW/CREATE, not APPROVE/REJECT
            // (those have their own negation handling)
            if (isNegatedContext(tokens, i) && (action === "SHOW" || action === "CREATE")) {
              score -= 0.5;
            } else {
              score += 1;
            }
          }
        }
      } else {
        // Multi-word synonym: check as a phrase
        const phraseLen = synTokens.length;
        for (let i = 0; i <= tokens.length - phraseLen; i++) {
          let allMatch = true;
          for (let j = 0; j < phraseLen; j++) {
            if (!fuzzyTokenMatch(tokens[i + j]!, synTokens[j]!)) {
              allMatch = false;
              break;
            }
          }
          if (allMatch) {
            score += 1.5; // phrase match is worth more
          }
        }
      }
    }
    if (score > bestActionScore) {
      bestActionScore = score;
      bestAction = action;
    }
  }

  // ── Detect subject ──
  for (const [subject, synonyms] of Object.entries(SUBJECT_SYNONYMS)) {
    let score = 0;
    for (const syn of synonyms) {
      const synTokens = tokenizeStemmed(syn);
      if (synTokens.length === 1) {
        for (const token of tokens) {
          if (fuzzyTokenMatch(token, synTokens[0]!)) {
            score += 1;
          }
        }
      } else {
        const phraseLen = synTokens.length;
        for (let i = 0; i <= tokens.length - phraseLen; i++) {
          let allMatch = true;
          for (let j = 0; j < phraseLen; j++) {
            if (!fuzzyTokenMatch(tokens[i + j]!, synTokens[j]!)) {
              allMatch = false;
              break;
            }
          }
          if (allMatch) {
            score += 1.5;
          }
        }
      }
    }
    if (score > bestSubjectScore) {
      bestSubjectScore = score;
      bestSubject = subject;
    }
  }

  return {
    action: bestActionScore > 0 ? bestAction : null,
    subject: bestSubjectScore > 0 ? bestSubject : null,
    actionConfidence: Math.min(bestActionScore / 2, 1),
    subjectConfidence: Math.min(bestSubjectScore / 2, 1),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED KEYWORD SCORING — token-aware with fuzzy matching
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Score how well a keyword matches against tokenized input.
 * Uses word-boundary-aware token matching with fuzzy tolerance.
 *
 * @returns score from 0 to 1 (0 = no match, 1 = perfect match)
 */
export function scoreKeywordMatch(inputTokens: string[], keyword: string): number {
  const kwTokens = tokenizeStemmed(keyword);
  if (kwTokens.length === 0) return 0;

  if (kwTokens.length === 1) {
    // Single-word keyword: find best matching token
    let bestScore = 0;
    const kwToken = kwTokens[0];
    if (!kwToken) return 0;
    for (let i = 0; i < inputTokens.length; i++) {
      const token = inputTokens[i];
      if (!token) continue;
      if (token === kwToken) {
        // Exact match — but check negation
        return isNegatedContext(inputTokens, i) ? 0.1 : 1.0;
      }
      // Fuzzy match
      if (fuzzyTokenMatch(token, kwToken)) {
        const dist = levenshtein(token, kwToken);
        const maxLen = Math.max(token.length, kwToken.length);
        const similarity = 1 - dist / maxLen;
        if (similarity > bestScore) {
          bestScore = isNegatedContext(inputTokens, i) ? similarity * 0.1 : similarity;
        }
      }
    }
    return bestScore;
  }

  // Multi-word keyword: check if the phrase appears as a subsequence of tokens
  // with fuzzy per-word matching (sliding window)
  const phraseLen = kwTokens.length;
  let bestPhraseScore = 0;

  for (let i = 0; i <= inputTokens.length - phraseLen; i++) {
    const wordScores: number[] = [];
    let allMatch = true;
    for (let j = 0; j < phraseLen; j++) {
      const token = inputTokens[i + j];
      const kwToken = kwTokens[j];
      if (token === kwToken) {
        wordScores.push(1.0);
      } else if (fuzzyTokenMatch(token!, kwToken!)) {
        const dist = levenshtein(token!, kwToken!);
        const maxLen = Math.max(token!.length, kwToken!.length);
        wordScores.push(1 - dist / maxLen);
      } else {
        allMatch = false;
        break;
      }
    }
    if (allMatch && wordScores.length === phraseLen) {
      const avgScore = wordScores.reduce((a, b) => a + b, 0) / wordScores.length;
      // Check negation at phrase start
      const negated = isNegatedContext(inputTokens, i);
      const finalScore = negated ? avgScore * 0.1 : avgScore;
      if (finalScore > bestPhraseScore) {
        bestPhraseScore = finalScore;
      }
    }
  }

  // Also try non-contiguous matching (words in order but not adjacent)
  // This handles "stock kya hai" matching "stock status" (stock + status concept)
  if (bestPhraseScore === 0 && phraseLen === 2) {
    let firstIdx = -1;
    let secondIdx = -1;
    for (let i = 0; i < inputTokens.length; i++) {
      if (firstIdx === -1 && fuzzyTokenMatch(inputTokens[i]!, kwTokens[0]!)) {
        firstIdx = i;
      }
      if (firstIdx !== -1 && i > firstIdx && fuzzyTokenMatch(inputTokens[i]!, kwTokens[1]!)) {
        secondIdx = i;
        break;
      }
    }
    if (firstIdx !== -1 && secondIdx !== -1) {
      // Non-contiguous match — lower score
      const gap = secondIdx - firstIdx - 1;
      bestPhraseScore = Math.max(0, 0.5 - gap * 0.1);
    }
  }

  return bestPhraseScore;
}

/**
 * Score an intent definition against the input.
 * Combines keyword matching score with action/subject decomposition bonus.
 *
 * @returns { score: number, matchedKeywords: number, coverage: number }
 */
export interface IntentScore {
  score: number;        // raw weighted score
  coverage: number;     // 0-1, what fraction of keywords matched
  decompositionBonus: number; // bonus from action+subject matching
}

export function scoreIntent(
  inputTokens: string[],
  keywords: string[],
  weight: number,
  decomposition: DecomposedQuery,
  expectedAction?: string,
  expectedSubject?: string,
): IntentScore {
  let totalKeywordScore = 0;
  let matchedKeywords = 0;

  for (const kw of keywords) {
    const kwScore = scoreKeywordMatch(inputTokens, kw);
    if (kwScore > 0.3) {
      matchedKeywords++;
      totalKeywordScore += kwScore;
    }
  }

  const coverage = keywords.length > 0 ? matchedKeywords / keywords.length : 0;
  let score = totalKeywordScore * weight;

  // ── Decomposition bonus ──
  // If the intent's expected action and subject match the decomposed query,
  // add a bonus. This helps generalize to phrasings not in the keyword list.
  let decompositionBonus = 0;
  if (expectedAction && decomposition.action === expectedAction) {
    decompositionBonus += decomposition.actionConfidence * 3;
  }
  if (expectedSubject && decomposition.subject === expectedSubject) {
    decompositionBonus += decomposition.subjectConfidence * 3;
  }
  score += decompositionBonus;

  return { score, coverage, decompositionBonus };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOUND QUERY DETECTION — split multi-intent queries
// ═══════════════════════════════════════════════════════════════════════════

const CONJUNCTION_REGEXES = [
  /\baur\b/i, /\band\b/i, /\bphir\b/i, /\bthen\b/i,
  /\buske baad\b/i, /\bke baad\b/i, /\bafter that\b/i,
  /\bfer\b/i, /\bphir se\b/i, /\balso\b/i, /\bplus\b/i,
];

/**
 * Detect if a query contains multiple intents separated by conjunctions.
 * Returns the split sub-queries, or null if it's a single intent.
 */
export function splitCompoundQuery(text: string): string[] | null {
  for (const regex of CONJUNCTION_REGEXES) {
    const match = text.match(regex);
    if (match && match.index !== undefined) {
      const before = text.slice(0, match.index).trim();
      const after = text.slice(match.index + match[0].length).trim();
      if (before.length > 3 && after.length > 3) {
        return [before, after];
      }
    }
  }
  return null;
}
