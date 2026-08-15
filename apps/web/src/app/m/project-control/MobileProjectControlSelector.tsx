"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function MobileProjectControlSelector({
  projects,
  selectedId,
}: {
  projects: { id: string; name: string }[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div className="mb-4">
      <select
        value={selectedId ?? ""}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          if (e.target.value) params.set("project", e.target.value);
          else params.delete("project");
          router.push(`/m/project-control?${params.toString()}`);
        }}
        className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] font-semibold outline-none"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
          color: "var(--color-ink-950)",
        }}
      >
        <option value="">— Select project —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}
