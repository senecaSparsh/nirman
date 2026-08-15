import { createAuthClient } from "better-auth/react";

// Don't hardcode a baseURL — let Better-Auth auto-detect from the browser's
// current origin. This works correctly on any deploy URL (Render, Vercel, etc.)
// without needing NEXT_PUBLIC_APP_URL to be set at build time.
export const authClient = createAuthClient();

export const { signIn, signOut, signUp, useSession } = authClient;
