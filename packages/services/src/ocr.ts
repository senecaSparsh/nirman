/**
 * OCR Service (M19 — Photo-driven DPR).
 *
 * Provides pluggable providers to extract structured data from photos of
 * handwritten daily progress reports (DPRs). The extracted data includes
 * work-type, material quantities, and labor counts, which can be used to
 * pre-fill a new DPR.
 *
 * Providers:
 *   - OpenAiVisionOcrProvider: Uses GPT-4o vision API (or any OpenAI-compatible
 *     vision endpoint). Best for handwritten notes in English/Hindi.
 *   - GoogleVisionOcrProvider: Uses Google Cloud Vision API (TEXT_DETECTION +
 *     DOCUMENT_TEXT_DETECTION). Good for printed and handwritten text.
 *   - AzureDiOcrProvider: Uses Azure Document Intelligence (Form Recognizer).
 *     Best for structured forms with tables.
 *   - StubOcrProvider: Logs the request but returns empty results. Used when
 *     no OCR integration is configured.
 */

import { ServiceError } from "./errors";

// ── Types ───────────────────────────────────────────────────

export interface DprOcrMaterialLine {
  materialName: string;
  quantity: number;
  unit: string;
}

export interface DprOcrLaborLine {
  trade: string;
  count: number;
  overtimeHours?: number;
}

export interface DprOcrResult {
  /** Work type mentioned in the DPR (e.g. "Foundation", "Slab Casting"). */
  workType?: string;
  /** Quantity of work done (e.g. 500 sqft of foundation). */
  workQty?: number;
  /** Unit of work (e.g. "sqft", "cubic meter", "unit"). */
  workUnit?: string;
  /** Material lines extracted from the DPR. */
  materials: DprOcrMaterialLine[];
  /** Labor lines extracted from the DPR. */
  labor: DprOcrLaborLine[];
  /** Overall progress percentage mentioned in the DPR, if any. */
  progressPercent?: number;
  /** Free-text notes from the DPR. */
  notes?: string;
  /** Confidence score (0-1) from the OCR engine. */
  confidence?: number;
  /** Raw text extracted from the image (for debugging/audit). */
  rawText?: string;
}

export interface OcrProvider {
  /** Extract DPR data from a photo (base64-encoded or URL). */
  extractDpr(image: { base64?: string; url?: string }): Promise<DprOcrResult>;
}

// ── Stub Provider ────────────────────────────────────────────

export class StubOcrProvider implements OcrProvider {
  async extractDpr(_image: { base64?: string; url?: string }): Promise<DprOcrResult> {
    console.log("[OCR Stub] DPR photo received — no provider configured, returning empty result");
    return {
      materials: [],
      labor: [],
      confidence: 0,
      rawText: "",
    };
  }
}

// ── OpenAI Vision Provider ───────────────────────────────────

export interface OpenAiVisionConfig {
  apiKey: string;
  baseUrl?: string; // for OpenAI-compatible endpoints
  model?: string;   // default: gpt-4o
}

/**
 * OpenAI Vision OCR Provider — uses GPT-4o (or compatible) vision model
 * to extract structured DPR data from a photo. The model is prompted with
 * a structured output schema to ensure reliable parsing.
 */
export class OpenAiVisionOcrProvider implements OcrProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(config: OpenAiVisionConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || "https://api.openai.com").replace(/\/$/, "");
    this.model = config.model || "gpt-4o";
  }

  async extractDpr(image: { base64?: string; url?: string }): Promise<DprOcrResult> {
    if (!image.base64 && !image.url) {
      throw new ServiceError("Either base64 or url must be provided", 400);
    }

    const imageUrl = image.url ?? `data:image/jpeg;base64,${image.base64}`;

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content: DPR_OCR_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the DPR data from this photo. Return ONLY valid JSON matching the schema. If a field is not visible, omit it or use null.",
              },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new ServiceError(`OpenAI Vision API error: ${res.status} ${errText}`, res.status as 400 | 500);
    }

    const data = (await res.json()) as OpenAiChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new ServiceError("OpenAI returned empty response", 500);

    return parseDprOcrJson(content);
  }
}

// ── Google Vision Provider ───────────────────────────────────

export interface GoogleVisionConfig {
  apiKey: string;
}

/**
 * Google Cloud Vision OCR Provider — uses TEXT_DETECTION to extract raw
 * text, then applies a lightweight parser to identify DPR fields.
 */
export class GoogleVisionOcrProvider implements OcrProvider {
  private apiKey: string;

  constructor(config: GoogleVisionConfig) {
    this.apiKey = config.apiKey;
  }

  async extractDpr(image: { base64?: string; url?: string }): Promise<DprOcrResult> {
    if (!image.base64) {
      throw new ServiceError("Google Vision requires base64-encoded image", 400);
    }

    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image.base64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
            },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new ServiceError(`Google Vision API error: ${res.status} ${errText}`, res.status as 400 | 500);
    }

    const data = (await res.json()) as GoogleVisionResponse;
    const fullText = data.responses?.[0]?.fullTextAnnotation?.text ?? "";
    if (!fullText) {
      return { materials: [], labor: [], confidence: 0, rawText: "" };
    }

    return parseDprFromRawText(fullText);
  }
}

// ── Azure Document Intelligence Provider ─────────────────────

export interface AzureDiConfig {
  apiKey: string;
  endpoint?: string; // e.g. https://<resource>.cognitiveservices.azure.com
}

/**
 * Azure Document Intelligence (Form Recognizer) OCR Provider — uses the
 * prebuilt-document model to extract text and layout, then parses DPR fields.
 */
export class AzureDiOcrProvider implements OcrProvider {
  private apiKey: string;
  private endpoint: string;

  constructor(config: AzureDiConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = (config.endpoint || "").replace(/\/$/, "");
  }

  async extractDpr(image: { base64?: string; url?: string }): Promise<DprOcrResult> {
    if (!image.base64) {
      throw new ServiceError("Azure DI requires base64-encoded image", 400);
    }
    if (!this.endpoint) {
      throw new ServiceError("Azure DI requires an endpoint URL in the config", 400);
    }

    const res = await fetch(
      `${this.endpoint}/documentintelligence/documentModels/prebuilt-document:analyze?api-version=2024-02-29-preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Ocp-Apim-Subscription-Key": this.apiKey,
        },
        body: Buffer.from(image.base64, "base64"),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new ServiceError(`Azure DI API error: ${res.status} ${errText}`, res.status as 400 | 500);
    }

    // Azure DI returns 202 with an Operation-Location header for polling
    const operationLocation = res.headers.get("Operation-Location");
    if (!operationLocation) {
      throw new ServiceError("Azure DI did not return Operation-Location header", 500);
    }

    // Poll for result (simplified — in production, use exponential backoff)
    await sleep(2000);
    const resultRes = await fetch(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": this.apiKey },
      signal: AbortSignal.timeout(30000),
    });
    if (!resultRes.ok) {
      throw new ServiceError(`Azure DI polling failed: ${resultRes.status}`, 500);
    }
    const result = (await resultRes.json()) as AzureDiResponse;
    const fullText = result.analyzeResult?.content ?? "";
    if (!fullText) {
      return { materials: [], labor: [], confidence: 0, rawText: "" };
    }

    return parseDprFromRawText(fullText);
  }
}

// ── DPR OCR System Prompt ────────────────────────────────────

const DPR_OCR_SYSTEM_PROMPT = `You are a construction site Daily Progress Report (DPR) OCR assistant.
You receive a photo of a handwritten or printed DPR from an Indian construction site.
Extract the following structured data and return it as JSON:

{
  "workType": "string — e.g. Foundation, Slab Casting, Brickwork, Plastering, RCC",
  "workQty": number — quantity of work done,
  "workUnit": "string — e.g. sqft, cubic meter, unit, running meter",
  "materials": [{ "materialName": "string", "quantity": number, "unit": "string" }],
  "labor": [{ "trade": "string — e.g. Mason, Labor, Carpenter, Steel Fixer", "count": number, "overtimeHours": number }],
  "progressPercent": number — 0-100, if mentioned,
  "notes": "string — any free-text notes from the DPR"
}

Rules:
- If a field is not visible or unclear, omit it (do not guess).
- Material names should be in English (translate Hindi/regional terms if needed).
- Quantities must be numbers (not strings).
- Units should be standard: "bag", "kg", "ton", "cft", "sqft", "cum", "unit", "litre".
- Labor count is the number of workers, not hours.
- Return ONLY the JSON object, no markdown or explanation.`;

// ── Parsing helpers ──────────────────────────────────────────

export function parseDprOcrJson(content: string): DprOcrResult {
  try {
    const json = JSON.parse(content);
    return {
      workType: json.workType ?? undefined,
      workQty: json.workQty != null ? Number(json.workQty) : undefined,
      workUnit: json.workUnit ?? undefined,
      materials: Array.isArray(json.materials)
        ? json.materials.map((m: Record<string, unknown>) => ({
            materialName: String(m.materialName ?? ""),
            quantity: Number(m.quantity ?? 0),
            unit: String(m.unit ?? ""),
          }))
        : [],
      labor: Array.isArray(json.labor)
        ? json.labor.map((l: Record<string, unknown>) => ({
            trade: String(l.trade ?? ""),
            count: Number(l.count ?? 0),
            overtimeHours: l.overtimeHours != null ? Number(l.overtimeHours) : undefined,
          }))
        : [],
      progressPercent: json.progressPercent != null ? Number(json.progressPercent) : undefined,
      notes: json.notes ?? undefined,
      confidence: 0.85, // OpenAI vision is generally reliable
      rawText: content,
    };
  } catch {
    // If JSON parsing fails, fall back to raw text parsing
    return parseDprFromRawText(content);
  }
}

/**
 * Parse DPR fields from raw OCR text (used by Google Vision and Azure DI
 * which return plain text, not structured JSON).
 *
 * This is a lightweight heuristic parser that looks for common DPR patterns:
 *   - "Work: Foundation" / "Work Type: RCC"
 *   - "Cement: 50 bag" / "Steel: 2.5 ton"
 *   - "Mason: 5" / "Labor: 10" / "Carpenter: 3"
 *   - "Progress: 25%"
 */
export function parseDprFromRawText(text: string): DprOcrResult {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const result: DprOcrResult = {
    materials: [],
    labor: [],
    confidence: 0.6,
    rawText: text,
  };

  const materialKeywords = [
    "cement", "steel", "sand", "aggregate", "bricks", "blocks", "concrete",
    "tmt", "rebar", "paint", "putty", "tiles", "gravel", "water", "wood",
    "plywood", "wire", "cable", "pipe", "pvc", "bitumen", "asphalt",
  ];
  const laborKeywords = [
    "mason", "labour", "labor", "carpenter", "steel fixer", "fitter",
    "electrician", "plumber", "helper", "supervisor", "bar bender",
  ];

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Work type
    if (!result.workType) {
      const workMatch = lower.match(/(?:work(?:\s*type)?|scope)\s*[:\-]\s*(.+)/i);
      if (workMatch?.[1]) {
        result.workType = workMatch[1].trim();
        continue;
      }
    }

    // Progress
    if (result.progressPercent == null) {
      const progMatch = lower.match(/progress\s*[:\-]\s*(\d+(?:\.\d+)?)\s*%?/i);
      if (progMatch?.[1]) {
        result.progressPercent = Number(progMatch[1]);
        continue;
      }
    }

    // Material lines
    for (const kw of materialKeywords) {
      if (lower.includes(kw)) {
        const qtyMatch = line.match(/(\d+(?:\.\d+)?)\s*(bag|kg|ton|cft|sqft|cum|unit|litre|ltr|nos|no|mm|m\b)/i);
        if (qtyMatch) {
          result.materials.push({
            materialName: kw.charAt(0).toUpperCase() + kw.slice(1),
            quantity: Number(qtyMatch[1]),
            unit: qtyMatch[2]?.toLowerCase() ?? "",
          });
        }
        break;
      }
    }

    // Labor lines
    for (const kw of laborKeywords) {
      if (lower.includes(kw)) {
        const countMatch = line.match(/(\d+)\s*(?:nos|no|persons|workers|men)?/i);
        if (countMatch) {
          const trade = kw.charAt(0).toUpperCase() + kw.slice(1);
          // Avoid duplicates
          if (!result.labor.some((l) => l.trade.toLowerCase() === trade.toLowerCase())) {
            result.labor.push({ trade, count: Number(countMatch[1]) });
          }
        }
        break;
      }
    }
  }

  return result;
}

// ── API response types ───────────────────────────────────────

interface OpenAiChatResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

interface GoogleVisionResponse {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
  }>;
}

interface AzureDiResponse {
  status?: string;
  analyzeResult?: { content?: string };
}

// ── Utilities ────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
