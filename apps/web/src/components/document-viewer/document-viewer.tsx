"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Loader2, FileText } from "lucide-react";

/**
 * DocumentViewer — a full-screen overlay that loads a /print/* document
 * in an iframe with a FAB-style scale+fade pop-up animation.
 *
 * No page redirection — the document opens within the current page.
 *
 * Usage:
 *   const [docUrl, setDocUrl] = useState<string | null>(null);
 *   <button onClick={() => setDocUrl(`/print/employment-agreement/${id}`)}>View</button>
 *   <DocumentViewer url={docUrl} title="Employment Agreement" onClose={() => setDocUrl(null)} />
 */

interface DocumentViewerProps {
  url: string | null;
  title?: string;
  onClose: () => void;
}

export function DocumentViewer({ url, title = "Document", onClose }: DocumentViewerProps) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  // Trigger the enter animation after mount
  useEffect(() => {
    if (url) {
      setVisible(true);
      setLoading(true);
    } else {
      setVisible(false);
    }
  }, [url]);

  // Close handler — declared before the Escape useEffect so it's in scope
  const handleClose = useCallback(() => {
    setVisible(false);
    // Wait for exit animation before unmounting
    setTimeout(onClose, 200);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    if (!url) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [url, handleClose]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease-out",
      }}
      onClick={handleClose}
    >
      <div
        className="flex flex-col w-full h-full max-w-4xl mx-auto bg-white rounded-none sm:rounded-xl overflow-hidden shadow-2xl"
        style={{
          transform: visible ? "scale(1)" : "scale(0.85)",
          transformOrigin: "bottom center",
          opacity: visible ? 1 : 0,
          transition: "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: "var(--color-line, #e5e7eb)", backgroundColor: "var(--color-paper, #fff)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="size-4 shrink-0" style={{ color: "var(--color-ink-500, #6b7280)" }} />
            <span className="font-semibold truncate text-sm" style={{ color: "var(--color-ink-950, #111827)" }}>
              {title}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="shrink-0 grid place-items-center size-8 rounded-full press"
            style={{ backgroundColor: "var(--color-concrete, #f3f4f6)" }}
          >
            <X className="size-4" style={{ color: "var(--color-ink-600, #4b5563)" }} />
          </button>
        </div>

        {/* Loading spinner */}
        {loading && (
          <div className="flex-1 grid place-items-center">
            <Loader2 className="size-6 animate-spin" style={{ color: "var(--color-ink-400, #9ca3af)" }} />
          </div>
        )}

        {/* Document iframe */}
        <iframe
          src={url}
          className="flex-1 w-full border-0"
          style={{ minHeight: 0, display: loading ? "none" : "block" }}
          onLoad={() => setLoading(false)}
          title={title}
        />
      </div>
    </div>
  );
}

/**
 * useDocumentViewer — a hook that manages the document viewer state.
 *
 * Usage:
 *   const { docUrl, docTitle, openDoc, closeDoc } = useDocumentViewer();
 *   <button onClick={() => openDoc("/print/employment-agreement/123", "Agreement")}>View</button>
 *   <DocumentViewer url={docUrl} title={docTitle} onClose={closeDoc} />
 */
export function useDocumentViewer() {
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("Document");

  const openDoc = useCallback((url: string, title?: string) => {
    setDocTitle(title ?? "Document");
    setDocUrl(url);
  }, []);

  const closeDoc = useCallback(() => {
    setDocUrl(null);
  }, []);

  return { docUrl, docTitle, openDoc, closeDoc };
}
