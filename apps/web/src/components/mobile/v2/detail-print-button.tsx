"use client";

import * as React from "react";
import { DocumentViewer, useDocumentViewer } from "@/components/document-viewer/document-viewer";

/**
 * Standard "Print" button for detail pages.
 *
 * Pattern: small bordered button with printer icon, opens the document in
 * the in-app DocumentViewer overlay (same page, top-right close) instead of
 * a new tab.
 */
export function DetailPrintButton({ href, title = "Document", children }: { href: string; title?: string; children?: React.ReactNode }) {
  const docViewer = useDocumentViewer();
  return (
    <>
      <button
        type="button"
        onClick={() => docViewer.openDoc(href, title)}
        className="flex items-center gap-1 text-m-body font-semibold px-2.5 py-1 rounded-[0.5rem] border text-m-body press shrink-0"
        style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
      >
        {children ?? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Print
          </>
        )}
      </button>
      <DocumentViewer url={docViewer.docUrl} title={docViewer.docTitle} onClose={docViewer.closeDoc} />
    </>
  );
}
