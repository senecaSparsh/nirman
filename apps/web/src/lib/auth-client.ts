import { createAuthClient } from "better-auth/react";

// Use NEXT_PUBLIC_APP_URL if set (set in render.yaml for production).
// Otherwise let Better-Auth auto-detect from window.location.origin.
export const authClient = createAuthClient(
  process.env.NEXT_PUBLIC_APP_URL
    ? { baseURL: process.env.NEXT_PUBLIC_APP_URL }
    : {}
);

export const { signIn, signOut, signUp, useSession } = authClient;
