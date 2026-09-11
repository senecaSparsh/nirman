import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";

// Use NEXT_PUBLIC_APP_URL if set (set in render.yaml for production).
// Otherwise let Better-Auth auto-detect from window.location.origin.

// Custom fetch wrapper that guarantees Content-Type: application/json on
// all POST requests. The @better-fetch/fetch library should set this
// automatically from the body, but for empty-body POSTs (like signOut())
// the header is sometimes not set, causing a 415 Unsupported Media Type
// from better-call's server-side body parser. This wraps the actual
// native fetch call at the lowest level to ensure the header is present.
const authFetch: typeof fetch = (input, init) => {
  if (init?.method === "POST") {
    // better-auth's signOut() sends an empty-body POST with no headers, so
    // init.headers can be undefined. We must still attach a Headers object
    // and set content-type, or better-call's body parser returns 415.
    const headers = new Headers(init.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return fetch(input, { ...init, headers });
  }
  return fetch(input, init);
};

export const authClient = createAuthClient({
  // Always use same-origin — the auth API is served from the same
  // server as the app. Using NEXT_PUBLIC_APP_URL here causes CORS
  // errors when accessing via 127.0.0.1 while the env var says localhost.
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
  plugins: [passkeyClient()],
  fetchOptions: {
    customFetchImpl: authFetch,
  },
});

export const { signIn, signOut, signUp, useSession } = authClient;
