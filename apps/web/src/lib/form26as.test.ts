import { describe, it, expect } from "vitest";
import { parseForm26as } from "./form26as";

const SAMPLE_TXT = `FORM NO. 26AS
Annual Tax Statement under Section 203AA of the Income Tax Act, 1961
PAN: AABCB1234K   Name: NIRMAN CONSTRUCTIONS PVT LTD

PART - A - DETAILS OF TAX DEDUCTED AT SOURCE
TAN of deductor: MUMB12345E    Name of deductor: SHARMA ESTATES LLP
Sr. No.  Section  Transaction date  Status  Date of booking  Amount paid/credited  Tax deducted  TDS deposited
1        194IA    15-Oct-2024       F       16-Oct-2024        4500000.00            45000.00      45000.00
2        194IA    20-11-2024        F       21-11-2024        6000000.00            60000.00      60000.00

TAN of deductor: DELC67890F    Name of deductor: VERMA INFRA PVT LTD
1        194C     05-Jan-2025       F       06-Jan-2025        1200000.00            24000.00      24000.00
`;

describe("parseForm26as", () => {
  it("parses section blocks with deductor attribution", () => {
    const rows = parseForm26as(SAMPLE_TXT);
    expect(rows).toHaveLength(3);
    expect(rows[0]!).toMatchObject({
      section: "194IA",
      deductorName: "SHARMA ESTATES LLP",
      deductorTan: "MUMB12345E",
      txnDate: "2024-10-15",
      taxDeducted: 45000,
      tdsDeposited: 45000,
      amountPaid: 4500000,
    });
    expect(rows[2]!).toMatchObject({
      section: "194C",
      deductorName: "VERMA INFRA PVT LTD",
      tdsDeposited: 24000,
    });
  });

  it("handles comma-formatted and dd/mm/yyyy rows", () => {
    const rows = parseForm26as(
      "1 194C 05/01/2025 F 06/01/2025 12,00,000.00 24,000.00 24,000.00",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tdsDeposited).toBe(24000);
    expect(rows[0]!.amountPaid).toBe(1200000);
    expect(rows[0]!.txnDate).toBe("2025-01-05");
  });

  it("ignores non-TDS lines and section-less noise", () => {
    const rows = parseForm26as(
      "PART A\nsome random text 1234\n194IA only section no amounts\n",
    );
    expect(rows).toHaveLength(0);
  });

  it("tolerates pasted CSV-ish rows", () => {
    const rows = parseForm26as(
      "194IA,2024-10-15,4500000.00,45000.00,45000.00",
    );
    // No recognisable date format (yyyy-mm-dd not in DATE_RES) — still a row.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tdsDeposited).toBe(45000);
    expect(rows[0]!.txnDate).toBeNull();
  });
});
