/**
 * Unit tests for env validation pure helpers.
 *
 *   isEnvVarRequired       — determine if an env var spec is required
 *   isAuthBypassDangerous  — check if AUTH_BYPASS=true is set in prod
 */
import { describe, it, expect } from "vitest";
import { isEnvVarRequired, isAuthBypassDangerous } from "./env-validation";

describe("isEnvVarRequired", () => {
  it("returns true for required var in prod", () => {
    expect(isEnvVarRequired({ required: true }, true)).toBe(true);
  });

  it("returns true for required var in dev", () => {
    expect(isEnvVarRequired({ required: true }, false)).toBe(true);
  });

  it("returns false for optional var in prod", () => {
    expect(isEnvVarRequired({ required: false }, true)).toBe(false);
  });

  it("returns false for optional var in dev", () => {
    expect(isEnvVarRequired({ required: false }, false)).toBe(false);
  });

  it("returns true for prodOnly var in prod", () => {
    expect(isEnvVarRequired({ required: true, prodOnly: true }, true)).toBe(true);
  });

  it("returns false for prodOnly var in dev", () => {
    expect(isEnvVarRequired({ required: true, prodOnly: true }, false)).toBe(false);
  });

  it("returns false for prodOnly=false var in dev", () => {
    // prodOnly: false means it's required in all envs
    expect(isEnvVarRequired({ required: true, prodOnly: false }, false)).toBe(true);
  });
});

describe("isAuthBypassDangerous", () => {
  it("returns true when AUTH_BYPASS=true in prod", () => {
    expect(isAuthBypassDangerous("true", true)).toBe(true);
  });

  it("returns false when AUTH_BYPASS=true in dev", () => {
    expect(isAuthBypassDangerous("true", false)).toBe(false);
  });

  it("returns false when AUTH_BYPASS is not set in prod", () => {
    expect(isAuthBypassDangerous(undefined, true)).toBe(false);
  });

  it("returns false when AUTH_BYPASS is not 'true' in prod", () => {
    expect(isAuthBypassDangerous("false", true)).toBe(false);
    expect(isAuthBypassDangerous("1", true)).toBe(false);
    expect(isAuthBypassDangerous("", true)).toBe(false);
  });

  it("returns false when AUTH_BYPASS is not set in dev", () => {
    expect(isAuthBypassDangerous(undefined, false)).toBe(false);
  });
});
