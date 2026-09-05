/**
 * Unit tests for the pure function `parseSms()` in sms-parser.ts.
 *
 * Parses Indian bank SMS notifications to extract:
 *   - amount (Rs. / INR with commas and decimals)
 *   - UPI reference number
 *   - account number (masked)
 *   - bank name (from sender ID)
 *   - transaction type (CREDIT / DEBIT / REFUND)
 *   - counterparty name
 *
 * No DB, no mocking — pure function.
 */
import { describe, it, expect } from "vitest";
import { parseSms } from "./sms-parser";

describe("parseSms", () => {
  // ── HDFC format ──
  it("parses HDFC credit SMS", () => {
    const result = parseSms(
      "HD-FB",
      "Rs.50000.00 has been credited to your a/c XX1234 via UPI. UPI Ref: 123456789012. On 02-09-26.",
    );
    expect(result.amount?.toNumber()).toBe(50000);
    expect(result.txnType).toBe("CREDIT");
    expect(result.bankName).toBe("HDFC");
    expect(result.accountNo).toBe("1234");
    expect(result.upiRef).toBe("123456789012");
  });

  // ── ICICI format ──
  it("parses ICICI credit SMS with INR prefix and commas", () => {
    const result = parseSms(
      "ICICIB",
      "INR 25,000.00 credited to a/c XX5678. UPI Ref: 987654321098.",
    );
    expect(result.amount?.toNumber()).toBe(25000);
    expect(result.txnType).toBe("CREDIT");
    expect(result.bankName).toBe("ICICI");
    expect(result.accountNo).toBe("5678");
  });

  // ── SBI format ──
  it("parses SBI credit SMS without decimals", () => {
    const result = parseSms(
      "SBIBNK",
      "Rs.100000 credited to your account xxx1234 by UPI.",
    );
    expect(result.amount?.toNumber()).toBe(100000);
    expect(result.txnType).toBe("CREDIT");
    expect(result.bankName).toBe("SBI");
    expect(result.accountNo).toBe("1234");
  });

  // ── Axis format ──
  it("parses Axis credit SMS via IMPS", () => {
    const result = parseSms(
      "AXISBK",
      "Rs.50000.00 credited to a/c XX9876 via IMPS from RAMESH KUMAR.",
    );
    expect(result.amount?.toNumber()).toBe(50000);
    expect(result.txnType).toBe("CREDIT");
    expect(result.bankName).toBe("AXIS");
    expect(result.counterparty).toBe("RAMESH KUMAR");
  });

  // ── Transaction type detection ──
  it("detects DEBIT transaction type", () => {
    const result = parseSms("HDFC", "Rs.1000.00 debited from your a/c XX1234.");
    expect(result.txnType).toBe("DEBIT");
  });

  it("detects REFUND transaction type", () => {
    const result = parseSms("HDFC", "Rs.5000.00 refund credited to your a/c XX1234.");
    expect(result.txnType).toBe("REFUND");
  });

  it("returns null txnType when no keyword found", () => {
    const result = parseSms("HDFC", "Your balance is Rs.50000.00.");
    expect(result.txnType).toBeNull();
  });

  // ── Amount extraction ──
  it("returns null amount when no amount pattern found", () => {
    const result = parseSms("HDFC", "Your account statement is ready.");
    expect(result.amount).toBeNull();
  });

  it("returns null amount when amount is 0", () => {
    const result = parseSms("HDFC", "Rs.0.00 credited to your a/c XX1234.");
    expect(result.amount).toBeNull();
  });

  it("handles Rs without period prefix", () => {
    const result = parseSms("HDFC", "Rs 15000 credited to your a/c XX1234.");
    expect(result.amount?.toNumber()).toBe(15000);
  });

  it("handles large amounts with commas", () => {
    const result = parseSms("HDFC", "INR 12,50,000.00 credited to your a/c XX1234.");
    expect(result.amount?.toNumber()).toBe(1250000);
  });

  // ── Bank detection ──
  it("detects KOTAK bank from sender", () => {
    const result = parseSms("KOTAK", "Rs.1000 credited to a/c XX1234.");
    expect(result.bankName).toBe("KOTAK");
  });

  it("detects YES bank from sender", () => {
    const result = parseSms("YESBNK", "Rs.1000 credited to a/c XX1234.");
    expect(result.bankName).toBe("YES");
  });

  it("detects UPI from sender (GPAY/PHONEPE/PAYTM)", () => {
    expect(parseSms("GPAY", "Rs.100 credited.").bankName).toBe("UPI");
    expect(parseSms("PHONEPE", "Rs.100 credited.").bankName).toBe("UPI");
    expect(parseSms("PAYTM", "Rs.100 credited.").bankName).toBe("UPI");
  });

  it("returns null bankName for unknown sender", () => {
    const result = parseSms("UNKNOWN", "Rs.1000 credited to a/c XX1234.");
    expect(result.bankName).toBeNull();
  });

  // ── UPI reference extraction ──
  it("extracts UPI reference number", () => {
    const result = parseSms("HDFC", "Rs.5000 credited. UPI Ref No: 123456789012.");
    expect(result.upiRef).toBe("123456789012");
  });

  it("extracts UPI reference with # separator", () => {
    const result = parseSms("HDFC", "Rs.5000 credited. UPI Ref # 987654321098.");
    expect(result.upiRef).toBe("987654321098");
  });

  it("returns null upiRef when not found", () => {
    const result = parseSms("HDFC", "Rs.5000 credited to your a/c XX1234.");
    expect(result.upiRef).toBeNull();
  });

  // ── Counterparty extraction ──
  it("extracts counterparty from 'from NAME'", () => {
    const result = parseSms("HDFC", "Rs.5000 credited from JOHN SMITH to your a/c XX1234.");
    expect(result.counterparty).toBe("JOHN SMITH");
  });

  it("extracts counterparty from 'by NAME'", () => {
    const result = parseSms("HDFC", "Rs.5000 credited by RAMESH KUMAR to your a/c XX1234.");
    expect(result.counterparty).toBe("RAMESH KUMAR");
  });

  it("returns null counterparty when not found", () => {
    const result = parseSms("HDFC", "Rs.5000 credited to your a/c XX1234 via UPI.");
    expect(result.counterparty).toBeNull();
  });

  // ── receivedAt ──
  it("passes through receivedAt date when provided", () => {
    const date = new Date("2026-09-02T10:00:00Z");
    const result = parseSms("HDFC", "Rs.5000 credited.", date);
    expect(result.receivedAt).toBe(date);
  });

  it("returns null receivedAt when not provided", () => {
    const result = parseSms("HDFC", "Rs.5000 credited.");
    expect(result.receivedAt).toBeNull();
  });

  // ── Edge cases ──
  it("handles empty message", () => {
    const result = parseSms("HDFC", "");
    expect(result.amount).toBeNull();
    expect(result.txnType).toBeNull();
    expect(result.bankName).toBe("HDFC");
  });

  it("handles message with no recognizable patterns", () => {
    const result = parseSms("UNKNOWN", "Hello, how are you?");
    expect(result.amount).toBeNull();
    expect(result.upiRef).toBeNull();
    expect(result.accountNo).toBeNull();
    expect(result.bankName).toBeNull();
    expect(result.txnType).toBeNull();
    expect(result.counterparty).toBeNull();
  });
});
