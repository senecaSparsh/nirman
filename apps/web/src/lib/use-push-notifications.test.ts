// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePushNotifications } from "./use-push-notifications";

function makePushSubscription() {
  return {
    endpoint: "https://fcm.googleapis.com/f/send/abc",
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ keys: { p256dh: "k1", auth: "a1" } }),
  };
}

function makeServiceWorkerRegistration(sub: unknown) {
  return {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(sub),
      subscribe: vi.fn().mockResolvedValue(sub),
    },
  };
}

describe("usePushNotifications", () => {
  let originalNotification: typeof Notification | undefined;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    originalNotification = (globalThis as { Notification?: typeof Notification }).Notification;
    // Default: supported, default permission.
    (globalThis as { Notification?: typeof Notification }).Notification = {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    } as unknown as typeof Notification;

    // serviceWorker + pushManager stubs.
    const reg = makeServiceWorkerRegistration(makePushSubscription());
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve(reg) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalNotification) {
      (globalThis as { Notification?: typeof Notification }).Notification = originalNotification;
    }
  });

  it("initial state: permission default, subscribed false, loading false", () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.permission).toBe("default");
    expect(result.current.subscribed).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("sets permission unsupported when Notification API absent", async () => {
    (globalThis as { Notification?: typeof Notification }).Notification = undefined as unknown as typeof Notification;
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => {
      expect(result.current.permission).toBe("unsupported");
    });
  });

  it("reads existing permission on mount", async () => {
    (globalThis as { Notification?: typeof Notification }).Notification = {
      permission: "denied",
      requestPermission: vi.fn(),
    } as unknown as typeof Notification;
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => {
      expect(result.current.permission).toBe("denied");
    });
  });

  it("detects existing subscription on mount", async () => {
    const reg = makeServiceWorkerRegistration(makePushSubscription());
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve(reg) },
      configurable: true,
    });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => {
      expect(result.current.subscribed).toBe(true);
    });
  });

  it("requestPermission: granted → subscribes + posts to server", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true } as Response);
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.permission).toBe("granted");
    expect(result.current.subscribed).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/notifications/subscribe",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("requestPermission: denied → does not subscribe", async () => {
    (globalThis as { Notification?: typeof Notification }).Notification = {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("denied"),
    } as unknown as typeof Notification;
    // No existing subscription for this test
    const reg = makeServiceWorkerRegistration(null);
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve(reg) },
      configurable: true,
    });
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.permission).toBe("denied");
    expect(result.current.subscribed).toBe(false);
  });

  it("requestPermission: loading true during, false after", async () => {
    let resolvePerm!: (v: string) => void;
    (globalThis as { Notification?: typeof Notification }).Notification = {
      permission: "default",
      requestPermission: vi.fn(
        () => new Promise<string>((resolve) => (resolvePerm = resolve)),
      ),
    } as unknown as typeof Notification;
    const { result } = renderHook(() => usePushNotifications());

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.requestPermission();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    await act(async () => {
      resolvePerm("granted");
      await pending;
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("requestPermission: no-op when Notification API unsupported", async () => {
    (globalThis as { Notification?: typeof Notification }).Notification = undefined as unknown as typeof Notification;
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => {
      expect(result.current.permission).toBe("unsupported");
    });

    await act(async () => {
      await result.current.requestPermission();
    });
    // Should remain unsupported; no fetch.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("unsubscribe: unsubscribes + DELETE to server + sets subscribed false", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true } as Response);
    const sub = makePushSubscription();
    const reg = makeServiceWorkerRegistration(sub);
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve(reg) },
      configurable: true,
    });
    const { result } = renderHook(() => usePushNotifications());

    // First confirm subscribed true on mount.
    await waitFor(() => {
      expect(result.current.subscribed).toBe(true);
    });

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/notifications/subscribe",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(result.current.subscribed).toBe(false);
  });

  it("unsubscribe: no existing subscription → just sets subscribed false", async () => {
    const reg = makeServiceWorkerRegistration(null);
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve(reg) },
      configurable: true,
    });
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(result.current.subscribed).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
