"use client";

import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileCreateCustomerButton } from "@/components/mobile/mobile-customer-form";

/**
 * Client-side "no customers" empty state for the new-sale page.
 * Uses router.refresh() instead of window.location.reload() to
 * reload the server component data after a customer is created.
 */
export function MobileNoCustomersState({
  existingPhones,
}: {
  existingPhones: string[];
}) {
  const router = useRouter();

  return (
    <MobileEmptyState
      icon={UserPlus}
      title="No customers yet"
      hint="Sales require a customer. Create one now to get started."
      action={
        <MobileCreateCustomerButton
          existingPhones={existingPhones}
          onCreated={() => {
            router.refresh();
          }}
        />
      }
    />
  );
}
