"use client";
import MobileErrorBoundary from "@/components/mobile/v2/mobile-error-boundary";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <MobileErrorBoundary {...props} />;
}
