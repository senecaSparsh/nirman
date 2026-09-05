// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePermissions } from "./permissions";

describe("usePermissions", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts with loading=true and a default role", () => {
    fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ role: "OWNER", id: "u1" }) });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.loading).toBe(true);
    expect(result.current.role).toBe("PROJECT_MANAGER");
  });

  it("fetches /api/me and sets the role on success", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ role: "OWNER", id: "u1" }) });
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("OWNER");
    expect(result.current.userId).toBe("u1");
  });

  it("sets loading=false on fetch failure", async () => {
    fetchSpy.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Role stays as default
    expect(result.current.role).toBe("PROJECT_MANAGER");
  });

  it("sets loading=false when response is not ok", async () => {
    fetchSpy.mockResolvedValue({ ok: false, json: () => Promise.resolve(null) });
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("PROJECT_MANAGER");
  });

  it("can() delegates to hasPermission with the current role", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ role: "OWNER", id: "u1" }) });
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // OWNER has "*" → can do anything
    expect(result.current.can("anything")).toBe(true);
  });

  it("can() returns false for permissions not in the role's list", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ role: "SUPERVISOR", id: "u1" }) });
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.can("po.approve")).toBe(false);
  });

  it("isManagerOrAbove() returns true for PROJECT_MANAGER", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ role: "PROJECT_MANAGER", id: "u1" }) });
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isManagerOrAbove()).toBe(true);
  });

  it("isOwnerOrAdmin() returns true for OWNER", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ role: "OWNER", id: "u1" }) });
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isOwnerOrAdmin()).toBe(true);
  });

  it("isOwnerOrAdmin() returns false for PROJECT_MANAGER", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ role: "PROJECT_MANAGER", id: "u1" }) });
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isOwnerOrAdmin()).toBe(false);
  });

  it("canManageUsers() returns true for ADMIN", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ role: "ADMIN", id: "u1" }) });
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canManageUsers()).toBe(true);
  });

  it("canApproveProcurement() returns true for PROJECT_MANAGER", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ role: "PROJECT_MANAGER", id: "u1" }) });
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canApproveProcurement()).toBe(true);
  });

  it("normalizes invalid role from API to SUPERVISOR", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ role: "INVALID_ROLE", id: "u1" }) });
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("SUPERVISOR");
  });
});
