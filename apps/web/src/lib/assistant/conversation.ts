/**
 * Conversation state machine for the Owner Assistant ("Sahayak").
 *
 * This module sits between the NLU (intent parsing) and the API executor.
 * It maintains conversation state across turns so the assistant can:
 *
 * 1. **Slot-filling**: if the user says "approve kar" without specifying
 *    which PO, the assistant asks "Kaunsa PO approve karna hai?" and
 *    waits for the answer. The next turn fills in the missing slot.
 *
 * 2. **Multi-step tasks**: if the user says "PO banao aur approve kar do",
 *    the assistant breaks it into step 1 (create PO) → confirm →
 *    step 2 (approve PO) → confirm.
 *
 * 3. **Clarification**: if the intent is ambiguous (e.g., "approve kar"
 *    could be PO or requisition), the assistant asks for clarification.
 *
 * 4. **Info gathering**: for create intents, the assistant asks for
 *    missing required info (supplier, material, quantity, etc.) before
 *    proceeding.
 *
 * The client sends the conversation context with each request. The API
 * is stateless — all state lives in the client and is passed back and forth.
 */

import type { Intent, ParsedIntent } from "./nlu";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  intent?: Intent;
  entities?: ParsedIntent["entities"];
}

export interface ConversationContext {
  /** Previous turns in this conversation (most recent last). */
  history: ConversationTurn[];
  /** The current task being worked on (if mid-task). */
  currentTask?: TaskState;
}

export interface TaskState {
  /** The intent being executed. */
  intent: Intent;
  /** Entities collected so far. */
  entities: ParsedIntent["entities"];
  /** Slots that are still missing (need user input). */
  missingSlots: string[];
  /** For multi-step tasks: the list of steps. */
  steps?: StepDef[];
  /** Current step index (0-based). */
  currentStep?: number;
  /** Raw text of the original request. */
  originalText: string;
}

export interface StepDef {
  intent: Intent;
  label: string;
  done: boolean;
}

/** Result of processing a turn — tells the API what to do. */
export interface ConversationResult {
  /** The resolved intent (may differ from raw parse if context filled slots). */
  intent: Intent;
  /** Resolved entities (merged from context + current parse). */
  entities: ParsedIntent["entities"];
  /** If true, the assistant needs more info from the user. */
  needsInput: boolean;
  /** The question to ask the user (if needsInput). */
  prompt?: string;
  /** If true, this is part of a multi-step task and there are more steps. */
  hasMoreSteps: boolean;
  /** Updated context to pass back to the client. */
  updatedContext: ConversationContext;
  /** If true, the task is ready to execute (all slots filled). */
  ready: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SLOT DEFINITIONS — what each intent needs
// ═══════════════════════════════════════════════════════════════════════════

interface SlotDef {
  name: string;
  /** Question to ask if this slot is missing. */
  prompt: string;
  /** Whether this slot is required (vs optional). */
  required: boolean;
}

const SLOTS: Partial<Record<Intent, SlotDef[]>> = {
  APPROVE_PO: [
    { name: "poNumber", prompt: "Kaunsa PO approve karna hai? PO number bataiye (jaise PO-0011).", required: true },
  ],
  APPROVE_REQUISITION: [
    { name: "reqNumber", prompt: "Kaunsi requisition approve karni hai? Number bataiye (jaise REQ-0007).", required: true },
  ],
  REJECT_PO: [
    { name: "poNumber", prompt: "Kaunsa PO reject karna hai? PO number bataiye.", required: true },
  ],
  REJECT_REQUISITION: [
    { name: "reqNumber", prompt: "Kaunsi requisition reject karni hai? Number bataiye.", required: true },
  ],
  STOCK_QUERY: [
    { name: "materialName", prompt: "Kaunsa material ka stock jaanna hai? Jaise cement, steel, sand.", required: false },
  ],
  SPEND_ANALYSIS: [
    { name: "materialName", prompt: "Kis material par kharcha dekhna hai? Jaise cement, steel, labour.", required: false },
  ],
  CREATE_PO: [
    { name: "supplierName", prompt: "Kaunse supplier se PO bana hai? Supplier ka naam bataiye.", required: false },
    { name: "materialName", prompt: "Kaunsa material order karna hai?", required: false },
    { name: "quantity", prompt: "Kitni quantity chahiye?", required: false },
  ],
  CREATE_REQUISITION: [
    { name: "materialName", prompt: "Kaunsa material chahiye?", required: false },
    { name: "quantity", prompt: "Kitni quantity chahiye?", required: false },
  ],
  SALE_CREATE: [
    { name: "customerName", prompt: "Customer ka naam bataiye (ya 'walk-in' bol do).", required: false },
    { name: "materialName", prompt: "Kya bechna hai? Material bataiye.", required: false },
    { name: "quantity", prompt: "Kitni quantity bechni hai?", required: false },
  ],
  SUPPLIER_PAYMENT: [
    { name: "supplierName", prompt: "Kaunse supplier ko pay karna hai?", required: false },
  ],
  // Real estate intents with optional project filter
  UNIT_STATUS: [
    { name: "projectName", prompt: "Kaunse project ke units dekhna hai? Ya 'sab' bolo saare projects ke liye.", required: false },
  ],
  UNIT_VALUATION: [
    { name: "projectName", prompt: "Kaunse project ki valuation dekhna hai? Ya 'sab' bolo.", required: false },
  ],
  PAYMENT_SCHEDULE: [
    { name: "projectName", prompt: "Kaunse project ke installments dekhna hai? Ya 'sab' bolo.", required: false },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-STEP TASK DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/** Conjunctions that indicate multiple actions in one request. */
const CONJUNCTIONS = [
  /\baur\b/i, /\band\b/i, /\bphir\b/i, /\bthen\b/i, /\buske baad\b/i,
  /\buske baad\s*$/i, /\bke baad\b/i, /\bafter that\b/i,
  /\bfer\b/i, /\bphir\s*se\b/i,
];

/**
 * Detect if a request contains multiple actions separated by conjunctions.
 * Returns the split sub-requests, or null if it's a single action.
 */
export function detectMultiStep(text: string): string[] | null {
  for (const conj of CONJUNCTIONS) {
    const match = text.match(conj);
    if (match && match.index !== undefined) {
      const before = text.slice(0, match.index).trim();
      const after = text.slice(match.index + match[0].length).trim();
      // Both parts must be non-trivial (> 3 chars) to count as multi-step
      if (before.length > 3 && after.length > 3) {
        return [before, after];
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AMBIGUITY DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if "approve" / "reject" is ambiguous (no PO/REQ number, no ordinal).
 * In this case, ask the user to clarify.
 */
function isApproveAmbiguous(parsed: ParsedIntent): boolean {
  if (parsed.intent !== "APPROVE_PO" && parsed.intent !== "APPROVE_REQUISITION" &&
      parsed.intent !== "REJECT_PO" && parsed.intent !== "REJECT_REQUISITION") {
    return false;
  }
  const e = parsed.entities;
  return !e.poNumber && !e.reqNumber && !e.ordinal && !e.number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT MERGING — fill slots from previous turns
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Merge entities from the current parse with entities from the conversation
 * context. Current turn takes precedence.
 */
function mergeEntities(
  current: ParsedIntent["entities"],
  previous?: ParsedIntent["entities"],
): ParsedIntent["entities"] {
  if (!previous) return current;
  return {
    ...previous,
    ...Object.fromEntries(
      Object.entries(current).filter(([, v]) => v !== undefined && v !== null),
    ),
  } as ParsedIntent["entities"];
}

// ═══════════════════════════════════════════════════════════════════════════
// YES/NO DETECTION — for confirmation responses
// ═══════════════════════════════════════════════════════════════════════════

const YES_WORDS = [
  "haan", "ha", "yes", "yeah", "yep", "ok", "okay", "theek", "thik",
  "sahi", "kar do", "kardo", "confirm", "haan kar do", "yes do it",
  "manzoor", "approve", "done", "ho jaye", "hojae", "chal",
];

const NO_WORDS = [
  "nahi", "na", "no", "nahi kar", "cancel", "cancel kar",
  "mat kar", "ruk", "ruko", "stop", "nahi chahiye",
];

export function isYes(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return YES_WORDS.some((w) => lower === w || lower.startsWith(w));
}

export function isNo(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return NO_WORDS.some((w) => lower === w || lower.startsWith(w));
}

/** Check if the user's response is just a yes/no (not a new command). */
export function isYesOrNo(text: string): boolean {
  return isYes(text) || isNo(text);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PROCESSOR — called by the API on each turn
// ═══════════════════════════════════════════════════════════════════════════

export function processConversation(
  parsed: ParsedIntent,
  context: ConversationContext,
): ConversationResult {
  const text = parsed.rawText;

  // ── Case 1: User is answering a follow-up question (slot-filling) ──
  if (context.currentTask && context.currentTask.missingSlots.length > 0) {
    const task = context.currentTask;

    // Check if user said "cancel" / "nahi"
    if (isNo(text)) {
      return {
        intent: "UNKNOWN",
        entities: {},
        needsInput: false,
        hasMoreSteps: false,
        ready: false,
        updatedContext: { history: context.history },
        prompt: "Theek hai, cancel kar diya. Kuch aur chahiye?",
      };
    }

    // Re-parse the answer as entities and merge with existing
    const mergedEntities = mergeEntities(parsed.entities, task.entities);

    // Check which slots are now filled
    const slotDefs = SLOTS[task.intent] ?? [];
    const stillMissing = slotDefs
      .filter((s) => s.required && (mergedEntities as Record<string, unknown>)[s.name] === undefined)
      .map((s) => s.name);

    if (stillMissing.length > 0) {
      // Still missing slots — ask again
      const nextSlot = slotDefs.find((s) => s.name === stillMissing[0]);
      return {
        intent: task.intent,
        entities: mergedEntities,
        needsInput: true,
        prompt: nextSlot?.prompt,
        hasMoreSteps: false,
        ready: false,
        updatedContext: {
          history: context.history,
          currentTask: { ...task, entities: mergedEntities, missingSlots: stillMissing },
        },
      };
    }

    // All slots filled — ready to execute
    const hasMoreSteps = (task.steps && task.currentStep !== undefined && task.currentStep < task.steps.length - 1) || false;
    return {
      intent: task.intent,
      entities: mergedEntities,
      needsInput: false,
      hasMoreSteps,
      ready: true,
      updatedContext: {
        history: context.history,
        currentTask: hasMoreSteps
          ? { ...task, entities: mergedEntities, missingSlots: [], currentStep: (task.currentStep ?? 0) + 1 }
          : undefined,
      },
    };
  }

  // ── Case 2: Multi-step task detection ──
  const steps = detectMultiStep(text);
  if (steps && steps.length > 1) {
    // Re-parse each step as a separate intent
    // For now, just acknowledge and process the first step
    // The client will send the next step after confirming
    const firstStepParsed = parsed; // The NLU already parsed the full text; first step intent is the dominant one
    const stepDefs: StepDef[] = steps.map((stepText, i) => ({
      intent: i === 0 ? parsed.intent : "UNKNOWN", // First step is parsed; subsequent steps parsed later
      label: stepText,
      done: i === 0 ? false : false,
    }));

    return {
      intent: parsed.intent,
      entities: parsed.entities,
      needsInput: false,
      hasMoreSteps: true,
      ready: true,
      updatedContext: {
        history: context.history,
        currentTask: {
          intent: parsed.intent,
          entities: parsed.entities,
          missingSlots: [],
          steps: stepDefs,
          currentStep: 0,
          originalText: text,
        },
      },
      prompt: `Ye multi-step task hai. Step 1: "${steps[0]}". Confirm karein, phir step 2: "${steps[1]}" karenge.`,
    };
  }

  // ── Case 3: Ambiguous approve/reject — ask for clarification ──
  if (isApproveAmbiguous(parsed)) {
    const isApprove = parsed.intent === "APPROVE_PO" || parsed.intent === "APPROVE_REQUISITION";
    const prompt = isApprove
      ? `Kaunsa ${parsed.intent.includes("PO") ? "PO" : "requisition"} ${parsed.intent.startsWith("REJECT") ? "reject" : "approve"} karna hai?\n\nNumber bataiye (jaise PO-0011) ya "pending list dikhao" bolo.`
      : "Kaunsa item? Number bataiye.";

    return {
      intent: parsed.intent,
      entities: parsed.entities,
      needsInput: true,
      prompt,
      hasMoreSteps: false,
      ready: false,
      updatedContext: {
        history: context.history,
        currentTask: {
          intent: parsed.intent,
          entities: parsed.entities,
          missingSlots: [parsed.intent.includes("PO") ? "poNumber" : "reqNumber"],
          originalText: text,
        },
      },
    };
  }

  // ── Case 4: Check for missing required slots ──
  const slotDefs = SLOTS[parsed.intent] ?? [];
  const requiredMissing = slotDefs.filter(
    (s) => s.required && (parsed.entities as Record<string, unknown>)[s.name] === undefined,
  );

  if (requiredMissing.length > 0) {
    const nextSlot = requiredMissing[0];
    return {
      intent: parsed.intent,
      entities: parsed.entities,
      needsInput: true,
      prompt: nextSlot?.prompt,
      hasMoreSteps: false,
      ready: false,
      updatedContext: {
        history: context.history,
        currentTask: {
          intent: parsed.intent,
          entities: parsed.entities,
          missingSlots: requiredMissing.map((s) => s.name),
          originalText: text,
        },
      },
    };
  }

  // ── Case 5: Check for missing optional slots (ask once, but proceed anyway) ──
  const optionalMissing = slotDefs.filter(
    (s) => !s.required && (parsed.entities as Record<string, unknown>)[s.name] === undefined,
  );

  if (optionalMissing.length > 0 && isCreateIntent(parsed.intent)) {
    // For create intents, ask for the first missing optional slot
    // but don't block — if user says "skip" or gives a new command, proceed
    const nextSlot = optionalMissing[0];
    if (!nextSlot) {
      return successResult(parsed, context);
    }
    return {
      intent: parsed.intent,
      entities: parsed.entities,
      needsInput: true,
      prompt: nextSlot.prompt + "\n\n(Ya 'skip' bolo aur direct form kholein.)",
      hasMoreSteps: false,
      ready: false,
      updatedContext: {
        history: context.history,
        currentTask: {
          intent: parsed.intent,
          entities: parsed.entities,
          missingSlots: optionalMissing.map((s) => s.name),
          originalText: text,
        },
      },
    };
  }

  // ── Case 6: All good — ready to execute ──
  return successResult(parsed, context);
}

function isCreateIntent(intent: Intent): boolean {
  return intent === "CREATE_PO" || intent === "CREATE_REQUISITION" ||
         intent === "SALE_CREATE" || intent === "SUPPLIER_PAYMENT";
}

function successResult(parsed: ParsedIntent, context: ConversationContext): ConversationResult {
  return {
    intent: parsed.intent,
    entities: parsed.entities,
    needsInput: false,
    hasMoreSteps: false,
    ready: true,
    updatedContext: {
      history: context.history,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELP: generate contextual suggestions based on conversation
// ═══════════════════════════════════════════════════════════════════════════

export function contextualSuggestions(context: ConversationContext): string[] {
  if (!context.currentTask) {
    return [
      "Stock kya hai?",
      "Approvals pending?",
      "Dashboard dikhao",
      "Aaj ki sales",
    ];
  }

  const task = context.currentTask;
  if (task.missingSlots.length > 0) {
    // User is answering a question — suggest relevant answers
    const slot = task.missingSlots[0];
    if (slot === "poNumber") return ["PO-0011", "Pehla wala", "Pending list dikhao"];
    if (slot === "reqNumber") return ["REQ-0007", "Pehla wala", "Pending list dikhao"];
    if (slot === "materialName") return ["Cement", "Steel", "Sand"];
    if (slot === "supplierName") return ["Supplier list dikhao", "Skip"];
    if (slot === "customerName") return ["Walk-in", "Skip"];
    if (slot === "quantity") return ["50 bag", "100 kg", "Skip"];
    return ["Skip"];
  }

  return ["Haan", "Nahi", "Cancel"];
}
