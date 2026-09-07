// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { usePermissions } from "./permissions";

describe("usePermissions", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  // Each renderHook gets an isolated SWR cache — SWR otherwise shares a
  // global cache across mounts and would leak /api/me data between tests.
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      SWRConfig,
      {
        value: {
          provider: () => new Map(),
          dedupingInterval: 0,
          shouldRetryOnError: () => false,
        },
      },
      children,
    );

  // swrFetcher reads r.ok / r.status / r.text() (and r.json() only in the
  // error branch), so mocks must provide all of them.
  function mockMe(body: unknown, ok = true) {
    fetchSpy.mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(body == null ? "" : JSON.stringify(body)),
    });
  }

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts with loading=true and a default role", () => {
    mockMe({ role: "OWNER", id: "u1" });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    expect(result.current.loading).toBe(true);
    expect(result.current.role).toBe("SUPERVISOR");
  });

  it("fetches /api/me and sets the role on success", async () => {
    mockMe({ role: "OWNER", id: "u1" });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("OWNER");
    expect(result.current.userId).toBe("u1");
  });

  it("sets loading=false on fetch failure", async () => {
    fetchSpy.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Role stays as default
    expect(result.current.role).toBe("SUPERVISOR");
  });

  it("sets loading=false when response is not ok", async () => {
    mockMe(null, false);
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("SUPERVISOR");
  });

  it("can() delegates to hasPermission with the current role", async () => {
    mockMe({ role: "OWNER", id: "u1" });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // OWNER has "*" → can do anything
    expect(result.current.can("anything")).toBe(true);
  });

  it("can() returns false for permissions not in the role's list", async () => {
    mockMe({ role: "SUPERVISOR", id: "u1" });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.can("po.approve")).toBe(false);
  });

  it("isManagerOrAbove() returns true for PROJECT_MANAGER", async () => {
    mockMe({ role: "PROJECT_MANAGER", id: "u1" });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isManagerOrAbove()).toBe(true);
  });

  it("isOwnerOrAdmin() returns true for OWNER", async () => {
    mockMe({ role: "OWNER", id: "u1" });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isOwnerOrAdmin()).toBe(true);
  });

  it("isOwnerOrAdmin() returns false for PROJECT_MANAGER", async () => {
    mockMe({ role: "PROJECT_MANAGER", id: "u1" });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isOwnerOrAdmin()).toBe(false);
  });

  it("canManageUsers() returns true for ADMIN", async () => {
    mockMe({ role: "ADMIN", id: "u1" });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canManageUsers()).toBe(true);
  });

  it("canApproveProcurement() returns true for PROJECT_MANAGER", async () => {
    mockMe({ role: "PROJECT_MANAGER", id: "u1" });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canApproveProcurement()).toBe(true);
  });

  it("normalizes invalid role from API to SUPERVISOR", async () => {
    mockMe({ role: "INVALID_ROLE", id: "u1" });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("SUPERVISOR");
  });
});
