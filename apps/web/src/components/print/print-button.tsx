"use client";

/** Print button — must be a Client Component because it uses onClick. */
export function PrintButton({ label = "Print", className }: { label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={className ?? "rounded-md bg-black px-6 py-2 text-sm font-medium text-white hover:bg-gray-800"}
    >
      {label}
    </button>
  );
}
