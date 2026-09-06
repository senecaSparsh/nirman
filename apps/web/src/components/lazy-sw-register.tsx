"use client";

import dynamic from "next/dynamic";

// Client wrapper so the Server Component layout.tsx can lazy-load
// SwRegister with ssr:false (not allowed directly in Server Components).
// `isDev` is forwarded from the server layout so the dynamically-imported
// chunk never references `process.env` (which triggers a Turbopack
// process.js polyfill chunk desync in dev).
const SwRegister = dynamic(
  () => import("@/components/sw-register").then((m) => m.SwRegister),
  { ssr: false },
);

export function LazySwRegister({ isDev }: { isDev: boolean }) {
  return <SwRegister isDev={isDev} />;
}
