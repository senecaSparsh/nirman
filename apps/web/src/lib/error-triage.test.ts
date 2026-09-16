import { describe, it, expect, vi } from "vitest";

// The module imports prisma + notification services at top level; the
// pure fingerprinting logic under test never touches them.
vi.mock("@nirman/db", () => ({ prisma: {} }));
vi.mock("@nirman/services", () => ({ createInAppNotification: vi.fn() }));

import { fingerprintFor } from "./error-triage";

const base = {
  type: "error",
  message: "Cannot read properties of undefined (reading 'findMany')",
  url: "https://nirman.life/m/sales",
};

describe("fingerprintFor", () => {
  it("is deterministic for identical inputs", () => {
    expect(fingerprintFor(base)).toBe(fingerprintFor({ ...base }));
  });

  it("groups the same bug across different entity ids in the message", () => {
    const a = fingerprintFor({ ...base, message: "User cm9x8y7z6w5v4u3t2s1r0q9p8 failed to save" });
    const b = fingerprintFor({ ...base, message: "user cl2m3n4o5p6q7r8s9t0u1v2w failed to save" });
    expect(a).toBe(b);
  });

  it("groups the same bug across different ids in the URL", () => {
    const a = fingerprintFor({ ...base, url: "https://nirman.life/m/sales/cm9x8y7z6w5v4u3t2s1r0q9p" });
    const b = fingerprintFor({ ...base, url: "https://nirman.life/m/sales/cl2m3n4o5p6q7r8s9t0u1v2w" });
    expect(a).toBe(b);
  });

  it("groups the same bug across numbers and quoted strings", () => {
    const a = fingerprintFor({ ...base, message: "PO 48291 exceeds budget 'Q3-2026'" });
    const b = fingerprintFor({ ...base, message: "po 777 exceeds budget 'Q4-2099'" });
    expect(a).toBe(b);
  });

  it("separates client vs server sources", () => {
    const a = fingerprintFor({ ...base, source: "client" });
    const b = fingerprintFor({ ...base, source: "server" });
    expect(a).not.toBe(b);
  });

  it("separates different messages", () => {
    const a = fingerprintFor(base);
    const b = fingerprintFor({ ...base, message: "Network request failed" });
    expect(a).not.toBe(b);
  });

  it("uses the top stack frame to distinguish same-message different-cause", () => {
    const stackA = "Error: x\n    at updatePO (https://nirman.life/_next/static/chunks/abc.js:1:234)";
    const stackB = "Error: x\n    at deleteUser (https://nirman.life/_next/static/chunks/def.js:9:876)";
    const a = fingerprintFor({ ...base, stack: stackA });
    const b = fingerprintFor({ ...base, stack: stackB });
    expect(a).not.toBe(b);
  });

  it("keeps the same bug grouped across different bundle chunk hashes", () => {
    const stackA = "Error: x\n    at updatePO (https://nirman.life/_next/static/chunks/abc123.js:1:234)";
    const stackB = "Error: x\n    at updatePO (https://nirman.life/_next/static/chunks/zzz999.js:4:999)";
    const a = fingerprintFor({ ...base, stack: stackA });
    const b = fingerprintFor({ ...base, stack: stackB });
    expect(a).toBe(b);
  });
});
