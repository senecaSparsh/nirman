/**
 * Unit tests for the pure encryption helpers in integration-config.ts.
 *
 *   encryptSecret — AES-256-GCM encryption with "enc:" prefix
 *   decryptSecret — decrypts "enc:" values, passes plaintext through
 *
 * Round-trip: decrypt(encrypt(x)) === x
 */
import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "./integration-config";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret string", () => {
    const plaintext = "my-api-key-12345";
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.startsWith("enc:")).toBe(true);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("encrypts to enc: prefixed format", () => {
    const encrypted = encryptSecret("test");
    expect(encrypted.startsWith("enc:")).toBe(true);
    // Format: enc:<iv>:<authTag>:<ciphertext>
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("enc");
  });

  it("produces different ciphertexts for same plaintext (random IV)", () => {
    const e1 = encryptSecret("same-secret");
    const e2 = encryptSecret("same-secret");
    expect(e1).not.toBe(e2); // different IVs → different ciphertexts
    // But both decrypt to the same value
    expect(decryptSecret(e1)).toBe("same-secret");
    expect(decryptSecret(e2)).toBe("same-secret");
  });

  it("passes plaintext through unchanged (no enc: prefix)", () => {
    expect(decryptSecret("plaintext-value")).toBe("plaintext-value");
    expect(decryptSecret("")).toBe("");
  });

  it("handles long secrets", () => {
    const long = "a".repeat(1000);
    const encrypted = encryptSecret(long);
    expect(decryptSecret(encrypted)).toBe(long);
  });

  it("handles special characters in secrets", () => {
    const special = "p@ssw0rd!#$%^&*()_+-={}[]|\\:;\"'<>,.?/";
    const encrypted = encryptSecret(special);
    expect(decryptSecret(encrypted)).toBe(special);
  });

  it("handles unicode in secrets", () => {
    const unicode = "密钥-🔑-key";
    const encrypted = encryptSecret(unicode);
    expect(decryptSecret(encrypted)).toBe(unicode);
  });
});

// ── Secret preservation on update ──────────────────────────────────
// The UI masks secrets as "••••••••" and submits "" for untouched fields;
// the upsert replaces `config` wholesale, so without the merge a save that
// doesn't re-send the secret silently wipes the stored credential.

describe("upsertIntegrationConfig secret preservation", () => {
  it("keeps the stored secret when the update sends an empty/masked value", async () => {
    const { upsertIntegrationConfig, listIntegrationConfigs } = await import("./integration-config");
    const { resetDb, createTestFixture } = await import("./test/setup");
    await resetDb();
    const { company } = await createTestFixture();

    // First save with a real token.
    await upsertIntegrationConfig({
      companyId: company.id,
      key: "WHATSAPP",
      enabled: true,
      config: { accessToken: "real-token-abc", phoneNumberId: "123", apiVersion: "v23.0" },
    });

    // Second save — the form re-sends "" for the masked secret (as the UI does).
    await upsertIntegrationConfig({
      companyId: company.id,
      key: "WHATSAPP",
      enabled: false,
      config: { accessToken: "", phoneNumberId: "456", apiVersion: "v23.0" },
    });

    const [cfg] = await listIntegrationConfigs(company.id);
    expect(cfg?.enabled).toBe(false);
    expect((cfg?.config as Record<string, unknown>).accessToken).toBe("real-token-abc");
    expect((cfg?.config as Record<string, unknown>).phoneNumberId).toBe("456");
  });
});
