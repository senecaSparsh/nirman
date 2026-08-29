"use client";

import { useState, useEffect, useCallback } from "react";

export interface WbsOption {
  id: string;
  label: string;
}

// Flatten a WBS tree (from /api/wbs/tree) into a flat list of { id, label }.
function flattenWbs(nodes: unknown[], depth = 0): WbsOption[] {
  const out: WbsOption[] = [];
  for (const n of nodes) {
    const node = n as Record<string, unknown>;
    const prefix = depth > 0 ? "  ".repeat(depth) + "↳ " : "";
    out.push({ id: node.id as string, label: `${prefix}${node.code} — ${node.name}` });
    const children = node.children;
    if (Array.isArray(children)) out.push(...flattenWbs(children, depth + 1));
  }
  return out;
}

// Fetch and flatten the WBS tree for a project. Returns [] if the project
// is empty, the fetch fails, or the user lacks WBS_VIEW permission.
export function useWbsOptions(projectId: string | null | undefined): WbsOption[] {
  const [options, setOptions] = useState<WbsOption[]>([]);

  const fetch = useCallback(async (pid: string) => {
    try {
      const res = await globalThis.fetch(`/api/wbs/tree?projectId=${pid}`);
      const data = await res.json();
      setOptions(flattenWbs(Array.isArray(data) ? data : []));
    } catch {
      setOptions([]);
    }
  }, []);

  useEffect(() => {
    if (projectId) fetch(projectId);
    else setOptions([]);
  }, [projectId, fetch]);

  return options;
}
