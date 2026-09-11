"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, XCircle, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ALL_ROLES, type Role } from "@/lib/roles";

/**
 * BulkImportDialog — upload a CSV of employees to create accounts in bulk.
 *
 * CSV columns (header row required):
 *   name*, email*, role, phone, employeeCode, designation, department, joiningDate
 *
 * (*) = required. role defaults to SUPERVISOR if not specified.
 * All accounts get a random temporary password (shown after import).
 */
export function BulkImportDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [error, setError] = useState("");

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setResults(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const rows = parseCsv(text);
        setParsed(rows);
        if (rows.length === 0) {
          setError("No data rows found in CSV");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse CSV");
        setParsed(null);
      }
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!parsed || parsed.length === 0) return;
    setImporting(true);
    setError("");
    try {
      const res = await fetch("/api/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Bulk import failed");
      }
      setResults(data.results);
      const { succeeded, failed } = data;
      if (failed === 0) {
        toast.success(`All ${succeeded} employees imported successfully`);
      } else {
        toast.warning(`${succeeded} imported, ${failed} failed — see details below`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      toast.error("Bulk import failed");
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const csv = "name,email,role,phone,employeeCode,designation,department,joiningDate\n" +
      "Rajesh Sharma,rajesh@nirman.in,SITE_ENGINEER,9876543210,EMP-001,Site Engineer,Construction,2024-01-15\n" +
      "Priya Patel,priya@nirman.in,ACCOUNTANT,9876543211,EMP-002,Senior Accountant,Finance,2024-02-01\n" +
      "Amit Kumar,amit@nirman.in,SUPERVISOR,9876543212,EMP-003,Site Supervisor,Construction,2024-03-10\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const validRows = parsed?.filter((r) => r.name && (r.email || r.phone)) ?? [];
  const canImport = validRows.length > 0 && !importing;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="Bulk Import Employees" description="Upload a CSV to create multiple employee accounts at once" className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-title text-foreground">Bulk Import Employees</h2>
          <p className="text-meta text-muted-foreground mt-0.5">
            Upload a CSV to create multiple employee accounts at once
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="h-3.5 w-3.5" /> Template
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-caption text-danger flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      {/* Results view */}
      {results ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4 rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-go" />
              <span className="text-body font-semibold">
                {results.filter((r) => r.success).length} succeeded
              </span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-danger" />
              <span className="text-body font-semibold">
                {results.filter((r) => !r.success).length} failed
              </span>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto rounded-md border border-border">
            <table className="w-full text-caption">
              <thead className="sticky top-0 bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-semibold">#</th>
                  <th className="text-left p-2 font-semibold">Name</th>
                  <th className="text-left p-2 font-semibold">Status</th>
                  <th className="text-left p-2 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.row} className="border-t border-border">
                    <td className="p-2 text-muted-foreground">{r.row}</td>
                    <td className="p-2 font-medium">{r.name}</td>
                    <td className="p-2">
                      {r.success ? (
                        <Badge variant="success">Created</Badge>
                      ) : (
                        <Badge variant="danger">Failed</Badge>
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {r.success ? "Account created" : r.error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setResults(null); setParsed(null); setFileName(""); }}>
              Import More
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : parsed ? (
        /* Preview view */
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-body">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{fileName}</span>
            <span className="text-muted-foreground">· {parsed.length} rows · {validRows.length} valid</span>
          </div>

          <div className="max-h-[400px] overflow-auto rounded-md border border-border">
            <table className="w-full text-caption">
              <thead className="sticky top-0 bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-semibold">#</th>
                  <th className="text-left p-2 font-semibold">Name</th>
                  <th className="text-left p-2 font-semibold">Email</th>
                  <th className="text-left p-2 font-semibold">Role</th>
                  <th className="text-left p-2 font-semibold">Phone</th>
                  <th className="text-left p-2 font-semibold">Code</th>
                  <th className="text-left p-2 font-semibold">Dept</th>
                  <th className="text-left p-2 font-semibold">Valid</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((row, i) => {
                  const valid = !!(row.name && (row.email || row.phone));
                  const roleValid = !row.role || ALL_ROLES.includes(row.role.toUpperCase() as Role);
                  return (
                    <tr key={i} className="border-t border-border">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2 font-medium">{row.name || <span className="text-danger">—</span>}</td>
                      <td className="p-2 text-muted-foreground">{row.email || "—"}</td>
                      <td className="p-2">{row.role || "SUPERVISOR"}</td>
                      <td className="p-2 text-muted-foreground">{row.phone || "—"}</td>
                      <td className="p-2 text-muted-foreground">{row.employeeCode || "—"}</td>
                      <td className="p-2 text-muted-foreground">{row.department || "—"}</td>
                      <td className="p-2">
                        {valid && roleValid ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-go" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-danger" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-md bg-muted/30 p-3 text-caption text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">Import notes:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>All accounts get a random temporary password (shown after import)</li>
              <li>Users that already exist (by email) will be added as members, not duplicated</li>
              <li>Invalid rows will be skipped — valid rows will still import</li>
              <li>Role defaults to SUPERVISOR if not specified</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setParsed(null); setFileName(""); }}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!canImport}>
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import {validRows.length} employees
            </Button>
          </div>
        </div>
      ) : (
        /* Upload view */
        <div className="space-y-4">
          <div
            className="rounded-lg border-2 border-dashed border-border p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-body font-medium text-foreground">Click to select a CSV file</p>
            <p className="text-caption text-muted-foreground mt-1">
              or drag and drop — max 500 rows
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          <div className="rounded-md bg-muted/30 p-3 text-caption text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">CSV format:</p>
            <p className="mb-1">Header row required. Columns:</p>
            <code className="block font-mono text-caption bg-card p-2 rounded border border-border">
              name*, email*, role, phone, employeeCode, designation, department, joiningDate
            </code>
            <p className="mt-1">(*) = required. role defaults to SUPERVISOR. joiningDate = YYYY-MM-DD.</p>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ── Types ──
type ParsedRow = {
  name: string;
  email: string;
  role: string;
  phone: string;
  employeeCode: string;
  designation: string;
  department: string;
  joiningDate: string;
};

type BulkResult = {
  row: number;
  name: string;
  success: boolean;
  error?: string;
  userId?: string;
  added?: boolean;
};

// ── CSV parser ──
function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    throw new Error("CSV must have a header row and at least one data row");
  }

  const headers = splitCsvLine(lines[0] ?? "").map((h) => h.trim().toLowerCase());
  const headerMap: Record<string, number> = {};
  headers.forEach((h, i) => { headerMap[h] = i; });

  // Validate required headers
  if (headerMap.name === undefined) {
    throw new Error("CSV must have a 'name' column");
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i] ?? "");
    const get = (key: string): string => {
      const idx = headerMap[key];
      return idx !== undefined ? (cells[idx]?.trim() ?? "") : "";
    };
    rows.push({
      name: get("name"),
      email: get("email"),
      role: get("role"),
      phone: get("phone"),
      employeeCode: get("employeecode"),
      designation: get("designation"),
      department: get("department"),
      joiningDate: get("joiningdate"),
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
