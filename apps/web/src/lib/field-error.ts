/**
 * fieldError — toast.error with an action button that scrolls to the field.
 *
 * Usage:
 *   fieldError("Name is required", "field-name");
 *
 * Shows an error toast with a "Go to field" action button. When tapped,
 * it scrolls the element with the given id into view (smooth, centered)
 * and focuses the first input inside it.
 */
import { toast } from "sonner";

export function fieldError(message: string, fieldId: string) {
  toast.error(message, {
    action: {
      label: "Go to field",
      onClick: () => {
        const el = document.getElementById(fieldId);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Focus the first focusable element inside the wrapper (input, select, etc.)
        const focusable = el.querySelector("input, select, textarea, button");
        if (focusable instanceof HTMLElement) {
          setTimeout(() => focusable.focus(), 300);
        }
      },
    },
    duration: 6000,
  });
}
