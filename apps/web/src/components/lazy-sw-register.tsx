"use client";

import dynamic from "next/dynamic";

// Client wrapper so the Server Component layout.tsx can lazy-load
// SwRegister with ssr:false (not allowed directly in Server Components).
const SwRegister = dynamic(
  () => import("@/components/sw-register").then((m) => m.SwRegister),
  { ssr: false },
);

export function LazySwRegister() {
  return <SwRegister />;
}
