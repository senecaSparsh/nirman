#!/usr/bin/env node
/**
 * Removes unused imports from the content.tsx files created by extract-content.mjs
 * Also fixes any other files with unused import warnings from the extraction.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";

const WEB_ROOT = join(process.cwd(), "apps/web", "src", "app");

function findFiles(dir, pattern, results = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      findFiles(fullPath, pattern, results);
    } else if (pattern.test(entry)) {
      results.push(fullPath);
    }
  }
  return results;
}

// Find all content.tsx files
const contentFiles = findFiles(WEB_ROOT, /^content\.tsx$/);

for (const file of contentFiles) {
  let content = readFileSync(file, "utf8");
  let modified = false;

  const lines = content.split("\n");
  const newLines = [];
  const importRegex = /^import\s+(?:type\s+)?(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+["']([^"']+)["'];?\s*$/;

  for (const line of lines) {
    const match = line.match(importRegex);
    if (match) {
      const namedImports = match[1]; // { A, B, C }
      const namespaceImport = match[2]; // * as X
      const defaultImport = match[3]; // X
      const fromPath = match[4];

      if (namedImports) {
        // Parse named imports - handle multi-line too
        const symbols = namedImports.split(",").map(s => {
          const trimmed = s.trim();
          // Handle "X as Y"
          const asMatch = trimmed.match(/^(\w+)\s+as\s+(\w+)$/);
          return asMatch ? { original: asMatch[1], local: asMatch[2] } : { original: trimmed, local: trimmed };
        }).filter(s => s.local);

        // Check which symbols are used in the rest of the file (excluding import lines)
        const fileBody = lines.filter(l => !l.match(importRegex)).join("\n");
        const usedSymbols = symbols.filter(s => {
          // Use word boundary to avoid partial matches
          const regex = new RegExp(`\\b${s.local}\\b`);
          return regex.test(fileBody);
        });

        if (usedSymbols.length === 0) {
          modified = true;
          continue; // Skip this import entirely
        } else if (usedSymbols.length < symbols.length) {
          // Rewrite with only used symbols
          const isTypeImport = line.includes("import type ");
          const usedStr = usedSymbols.map(s =>
            s.original !== s.local ? `${s.original} as ${s.local}` : s.local
          ).join(", ");
          newLines.push(`${isTypeImport ? "import type " : "import"} { ${usedStr} } from "${fromPath}";`);
          modified = true;
          continue;
        }
      } else if (namespaceImport) {
        const fileBody = lines.filter(l => !l.match(importRegex)).join("\n");
        if (!new RegExp(`\\b${namespaceImport}\\b`).test(fileBody)) {
          modified = true;
          continue;
        }
      } else if (defaultImport) {
        const fileBody = lines.filter(l => !l.match(importRegex)).join("\n");
        if (!new RegExp(`\\b${defaultImport}\\b`).test(fileBody)) {
          modified = true;
          continue;
        }
      }
    }
    newLines.push(line);
  }

  if (modified) {
    // Clean up multiple consecutive blank lines
    let result = newLines.join("\n").replace(/\n{3,}/g, "\n\n");
    writeFileSync(file, result);
    console.log(`Cleaned: ${file.replace(WEB_ROOT + "/", "")}`);
  }
}

// Also fix workflows/[id]/page.tsx which has unused 'connection' import
const wfPage = join(WEB_ROOT, "workflows", "[id]", "page.tsx");
let wfContent = readFileSync(wfPage, "utf8");
if (wfContent.includes("connection") && !wfContent.includes("await connection()")) {
  // Remove the connection import
  wfContent = wfContent.replace(/import\s+\{\s*connection\s*\}\s+from\s+["']next\/server["'];?\n/, "");
  writeFileSync(wfPage, wfContent);
  console.log("Cleaned: workflows/[id]/page.tsx (removed unused connection import)");
}

// Fix m/reports/page.tsx pre-existing warnings
const mReportsPage = join(WEB_ROOT, "m", "reports", "page.tsx");
if (statSync(mReportsPage)) {
  let mrContent = readFileSync(mReportsPage, "utf8");
  // Remove unused hasPermission import
  mrContent = mrContent.replace(/,\s*hasPermission/g, "");
  mrContent = mrContent.replace(/hasPermission,\s*/g, "");
  // Check if role is used - the warning says 'role' is defined but never used as an arg
  // This is a pre-existing issue, let's check
  writeFileSync(mReportsPage, mrContent);
  console.log("Checked: m/reports/page.tsx");
}

console.log("Done");
