import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// Capture the customFetchImpl passed to createAuthClient.
// vi.hoisted runs before any other code (including vi.mock factories),
// so the state object is available when the mock factory executes.
const { state } = vi.hoisted(() => ({
  state: { capturedFetchImpl: undefined as typeof fetch | undefined },
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: vi.fn((config?: Record<string, unknown>) => {
    const fetchOptions = config?.fetchOptions as { customFetchImpl?: typeof fetch } | undefined;
    state.capturedFetchImpl = fetchOptions?.customFetchImpl;
    return {
      signIn: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn(),
      useSession: vi.fn(),
    };
  }),
}));

// Import after mock is set up
import { authClient, signIn, signOut, signUp, useSession } from "./auth-client";

describe("auth-client", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("exports authClient with signIn, signOut, signUp, useSession", () => {
    expect(authClient).toBeDefined();
    expect(typeof signIn).toBe("function");
    expect(typeof signOut).toBe("function");
    expect(typeof signUp).toBe("function");
    expect(typeof useSession).toBe("function");
  });

  it("registers a customFetchImpl with createAuthClient", () => {
    expect(state.capturedFetchImpl).toBeDefined();
    expect(typeof state.capturedFetchImpl).toBe("function");
  });

  it("customFetchImpl adds content-type: application/json to POST requests", async () => {
    const impl = state.capturedFetchImpl!;
    await impl("http://localhost/api/auth/sign-out", {
      method: "POST",
      // No headers — simulates signOut() empty-body POST
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init.headers.get("content-type")).toBe("application/json");
  });

  it("customFetchImpl does not override an existing content-type header", async () => {
    const impl = state.capturedFetchImpl!;
    await impl("http://localhost/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "multipart/form-data" },
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init.headers.get("content-type")).toBe("multipart/form-data");
  });

  it("customFetchImpl does not add content-type to GET requests", async () => {
    const impl = state.capturedFetchImpl!;
    await impl("http://localhost/api/auth/get-session", {
      method: "GET",
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    // No content-type should have been set by our wrapper
    expect(init.headers).toBeUndefined();
  });

  it("customFetchImpl does not add content-type to requests with no method (defaults to GET)", async () => {
    const impl = state.capturedFetchImpl!;
    await impl("http://localhost/api/data");
    const [, init] = fetchSpy.mock.calls[0]!;
    // init is undefined since no init was passed
    expect(init).toBeUndefined();
  });

  it("customFetchImpl preserves other headers when adding content-type to POST", async () => {
    const impl = state.capturedFetchImpl!;
    await impl("http://localhost/api/auth/sign-in", {
      method: "POST",
      headers: { authorization: "Bearer token123" },
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init.headers.get("authorization")).toBe("Bearer token123");
    expect(init.headers.get("content-type")).toBe("application/json");
  });

  it("customFetchImpl passes through the body unchanged", async () => {
    const impl = state.capturedFetchImpl!;
    const body = JSON.stringify({ email: "test@test.com" });
    await impl("http://localhost/api/auth/sign-in", {
      method: "POST",
      body,
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init.body).toBe(body);
  });
});
