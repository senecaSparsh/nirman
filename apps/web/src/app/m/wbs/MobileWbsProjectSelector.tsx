"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, FolderKanban } from "lucide-react";

interface ProjectOption {
  id: string;
  name: string;
}

/**
 * MobileWbsProjectSelector — dropdown that switches the WBS page
 * to a different project via `?project=ID` search param.
 */
export function MobileWbsProjectSelector({
  projects,
  selectedId,
}: {
  projects: ProjectOption[];
  selectedId?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function selectProject(id: string) {
    setOpen(false);
    const next = new URLSearchParams(params?.toString() ?? "");
    if (id) {
      next.set("project", id);
    } else {
      next.delete("project");
    }
    router.push(`/m/wbs?${next.toString()}`);
  }

  const current = projects.find((p) => p.id === selectedId);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 rounded-[0.625rem] border p-2.5 press"
        style={{
          borderColor: open ? "var(--color-ink-950)" : "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <span
          className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0"
          style={{ backgroundColor: "var(--color-concrete)" }}
        >
          <FolderKanban
            className="size-3.5"
            style={{ color: "var(--color-ink-500)" }}
          />
        </span>
        <div className="min-w-0 flex-1 text-left">
          <p
            className="text-[0.5625rem] uppercase tracking-wide font-semibold"
            style={{ color: "var(--color-ink-500)" }}
          >
            Project
          </p>
          <p
            className="text-[0.75rem] font-semibold truncate"
            style={{ color: "var(--color-ink-950)" }}
          >
            {current?.name ?? "Select project…"}
          </p>
        </div>
        <ChevronDown
          className="size-4 shrink-0 transition-transform"
          style={{
            color: "var(--color-ink-500)",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>

      {open ? (
        <div
          className="absolute top-full left-0 right-0 z-30 mt-1 rounded-[0.625rem] border-2 shadow-lg overflow-hidden max-h-64 overflow-y-auto"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
          }}
        >
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => selectProject(p.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left press"
              style={{
                backgroundColor:
                  p.id === selectedId
                    ? "var(--color-concrete)"
                    : "transparent",
              }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="text-[0.6875rem] font-semibold truncate"
                  style={{ color: "var(--color-ink-950)" }}
                >
                  {p.name}
                </p>
              </div>
              {p.id === selectedId ? (
                <Check
                  className="size-3.5 shrink-0"
                  style={{ color: "var(--color-go)" }}
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
