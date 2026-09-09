#!/usr/bin/env node
/**
 * Extracts named content exports from Next.js page files into separate content.tsx files.
 * This fixes the .next/types validation error where page files export non-standard functions.
 *
 * Usage: node scripts/extract-content.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname, relative } from "path";

const WEB_ROOT = join(process.cwd(), "apps/web", "src", "app");

// Valid Next.js page exports
const VALID_NEXT_EXPORTS = new Set([
  "default", "metadata", "generateMetadata", "viewport", "generateViewport",
  "config", "dynamic", "revalidate", "runtime", "generateStaticParams",
  "dynamicParams", "fetchCache", "preferredRegion", "unstable_instant",
  "unstable_dynamicStaleTime",
]);

// Recursively find all page.tsx files
function findPageFiles(dir, results = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      findPageFiles(fullPath, results);
    } else if (entry === "page.tsx") {
      results.push(fullPath);
    }
  }
  return results;
}

const pageFiles = findPageFiles(WEB_ROOT);

let fixed = 0;
let skipped = 0;

for (const pageFile of pageFiles) {
  const content = readFileSync(pageFile, "utf8");

  // Find named exports that aren't valid Next.js exports
  // Match: export async function X, export function X, export const X
  const exportRegex = /export\s+(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=)/g;
  let match;
  const namedExports = [];
  while ((match = exportRegex.exec(content)) !== null) {
    const name = match[1] || match[2];
    if (!VALID_NEXT_EXPORTS.has(name)) {
      namedExports.push(name);
    }
  }

  if (namedExports.length === 0) {
    continue; // No invalid exports
  }

  const dir = dirname(pageFile);
  const contentFile = join(dir, "content.tsx");

  if (existsSync(contentFile)) {
    console.log(`SKIP (content.tsx exists): ${relative(WEB_ROOT, pageFile)}`);
    skipped++;
    continue;
  }

  console.log(`FIX: ${relative(WEB_ROOT, pageFile)} — exports: ${namedExports.join(", ")}`);

  // Strategy: move ALL imports + ALL non-default, non-valid exports to content.tsx
  // Keep in page.tsx: default export wrapper + valid Next.js exports + minimal imports

  // Parse the file into sections
  const lines = content.split("\n");
  const importLines = [];
  const validExportLines = [];
  const contentLines = [];
  const defaultExportLines = [];

  let i = 0;
  let inDefaultExport = false;
  let braceDepth = 0;
  let inContentExport = false;
  let contentExportName = null;

  // Simple state machine to parse the file
  while (i < lines.length) {
    const line = lines[i];

    // Check for imports
    if (/^import\s/.test(line.trim())) {
      // Handle multi-line imports
      let importBlock = line;
      let j = i;
      while (!importBlock.includes("from ") || !importBlock.trim().endsWith('"') && !importBlock.trim().endsWith(";")) {
        j++;
        if (j >= lines.length) break;
        importBlock += "\n" + lines[j];
      }
      importLines.push(lines.slice(i, j + 1).join("\n"));
      i = j + 1;
      continue;
    }

    // Check for valid Next.js exports (metadata, dynamic, etc.)
    const validExportMatch = line.match(/^export\s+(const|let|var)\s+(\w+)/);
    if (validExportMatch && VALID_NEXT_EXPORTS.has(validExportMatch[2])) {
      validExportLines.push(line);
      i++;
      continue;
    }

    // Check for default export
    if (/^export\s+default\s+/.test(line.trim())) {
      inDefaultExport = true;
      braceDepth = 0;
      const defaultBlock = [];
      while (i < lines.length) {
        const l = lines[i];
        defaultBlock.push(l);
        // Count braces to find end of function
        for (const ch of l) {
          if (ch === "{") braceDepth++;
          if (ch === "}") braceDepth--;
        }
        i++;
        if (inDefaultExport && braceDepth <= 0 && defaultBlock.length > 1) {
          break;
        }
      }
      defaultExportLines.push(defaultBlock.join("\n"));
      inDefaultExport = false;
      continue;
    }

    // Check for named content export (function or const)
    const namedFuncMatch = line.match(/^export\s+(async\s+)?function\s+(\w+)/);
    const namedConstMatch = line.match(/^export\s+const\s+(\w+)/);

    if (namedFuncMatch && !VALID_NEXT_EXPORTS.has(namedFuncMatch[2])) {
      contentExportName = namedFuncMatch[2];
      inContentExport = true;
      braceDepth = 0;
      const contentBlock = [];
      // Remove "export " from the line
      contentBlock.push(line.replace(/^export\s+/, ""));
      for (const ch of line) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
      i++;
      while (i < lines.length && braceDepth > 0) {
        const l = lines[i];
        contentBlock.push(l);
        for (const ch of l) {
          if (ch === "{") braceDepth++;
          if (ch === "}") braceDepth--;
        }
        i++;
      }
      // Re-add export keyword
      contentLines.push("export " + contentBlock.join("\n"));
      inContentExport = false;
      continue;
    }

    if (namedConstMatch && !VALID_NEXT_EXPORTS.has(namedConstMatch[2])) {
      // Handle export const X = ...
      const contentBlock = [line.replace(/^export\s+/, "")];
      i++;
      // Read until we find the end of the statement (semicolon at top level)
      let depth = 0;
      while (i < lines.length) {
        const l = lines[i];
        for (const ch of l) {
          if (ch === "(" || ch === "[" || ch === "{") depth++;
          if (ch === ")" || ch === "]" || ch === "}") depth--;
        }
        contentBlock.push(l);
        i++;
        if (depth <= 0 && l.trim().endsWith(";")) break;
      }
      contentLines.push("export " + contentBlock.join("\n"));
      continue;
    }

    // Other lines (comments, blank lines, etc.) - put in content file
    contentLines.push(line);
    i++;
  }

  // Determine which imports the default export wrapper needs
  // Usually: Suspense from react, PageLoading, and the content component
  const defaultExportText = defaultExportLines.join("\n");

  // Find imports used in the default export
  const wrapperImports = [];
  for (const imp of importLines) {
    // Check if any symbol from this import is used in the default export
    const symbolMatch = imp.match(/\{([^}]+)\}/);
    if (symbolMatch) {
      const symbols = symbolMatch[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim());
      const usedSymbols = symbols.filter(s => s && defaultExportText.includes(s));
      if (usedSymbols.length > 0) {
        // Rewrite import with only used symbols
        if (usedSymbols.length === symbols.length) {
          wrapperImports.push(imp);
        } else {
          // Filter to only used symbols
          const fromMatch = imp.match(/from\s+["']([^"']+)["']/);
          if (fromMatch) {
            const isTypeImport = imp.includes("import type ");
            wrapperImports.push(`${isTypeImport ? "import type " : "import"} { ${usedSymbols.join(", ")} } from "${fromMatch[1]}";`);
          }
        }
      }
    } else {
      // Default import or namespace import - check if used
      const defaultMatch = imp.match(/import\s+(\w+)/);
      if (defaultMatch && defaultExportText.includes(defaultMatch[1])) {
        wrapperImports.push(imp);
      }
      const namespaceMatch = imp.match(/import\s+\*\s+as\s+(\w+)/);
      if (namespaceMatch && defaultExportText.includes(namespaceMatch[1])) {
        wrapperImports.push(imp);
      }
    }
  }

  // Add import for content component
  const contentImport = `import { ${namedExports.join(", ")} } from "./content";`;
  wrapperImports.push(contentImport);

  // Write content.tsx
  const contentTs = importLines.join("\n") + "\n\n" + contentLines.filter(l => l.trim()).join("\n") + "\n";
  writeFileSync(contentFile, contentTs);

  // Write new page.tsx
  const newPageTs = wrapperImports.join("\n") + "\n\n" + validExportLines.join("\n") + "\n\n" + defaultExportLines.join("\n") + "\n";
  writeFileSync(pageFile, newPageTs);

  // Update test files
  const testFile = join(dir, "page.test.tsx");
  if (existsSync(testFile)) {
    let testContent = readFileSync(testFile, "utf8");
    for (const name of namedExports) {
      testContent = testContent.replace(
        new RegExp(`import\\s+\\{([^}]*\\b${name}\\b[^}]*)\\}\\s+from\\s+["']\\./page["']`),
        (match, imports) => `import { ${imports.trim()} } from "./content"`
      );
    }
    writeFileSync(testFile, testContent);
    console.log(`  → Updated test: ${relative(WEB_ROOT, testFile)}`);
  }

  fixed++;
}

console.log(`\nDone: ${fixed} files fixed, ${skipped} skipped`);
