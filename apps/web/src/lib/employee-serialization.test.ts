import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Employee-serialization guard — encodes the AGENTS.md rule:
 * "Never json() a raw Employee row."
 *
 * Employee rows carry bank details, gov IDs (PAN/Aadhaar/PF/ESI/UAN), wages,
 * and bearer tokens (contractToken/offerToken). A route that returns a full
 * row — even to an authorized viewer — leaks every future sensitive column
 * added to the model. This test fails the build if any API route reads
 * `prisma.employee` without either (a) a `select:` clause on every read call,
 * or (b) a serializer import (pickEmployeeRoster / redactEmployeeRow).
 *
 * Mutations (create/update/upsert) are exempt — they don't return row data
 * unless the route chooses to, and the result still flows through the
 * response path the same way. The check targets read calls only.
 */

const API_DIR = join(__dirname, "../app/api");

function* routeFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== "node_modules") yield* routeFiles(p);
    } else if (entry === "route.ts" || entry === "route.tsx") {
      yield p;
    }
  }
}

const SERIALIZER_RE = /pickEmployeeRoster|redactEmployeeRow|serializeEmployee/;
const READ_CALL_RE = /prisma\.employee\.(findMany|findFirst|findUnique|findUniqueOrThrow|findFirstOrThrow)\s*\(/g;

describe("employee serialization", () => {
  it("no API route reads Employee rows without select/serializer", () => {
    const violations: string[] = [];
    for (const file of routeFiles(API_DIR)) {
      const src = readFileSync(file, "utf8");
      if (!READ_CALL_RE.test(src)) continue;
      READ_CALL_RE.lastIndex = 0;
      // File uses a serializer → whole-row reads are post-processed. Safe.
      if (SERIALIZER_RE.test(src)) continue;
      // Otherwise every read call site must have a `select:` within the
      // following ~60 lines (the call's argument object).
      const lines = src.split("\n");
      let bad = false;
      for (const m of src.matchAll(READ_CALL_RE)) {
        const upto = src.slice(m.index, m.index + 4000);
        const firstBrace = upto.indexOf("{");
        const closeParen = upto.indexOf("})");
        const callWindow = firstBrace === -1 ? upto : upto.slice(0, Math.max(closeParen, firstBrace + 4000));
        if (!/select\s*:/.test(callWindow)) {
          bad = true;
          break;
        }
      }
      if (bad) violations.push(file.replace(join(__dirname, "../.."), ""));
    }
    expect(
      violations,
      `Employee rows read without select:/serializer — a raw row leaks bank details, gov IDs, wages and bearer tokens:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
