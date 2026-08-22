/**
 * Print layout — bare container (no AppShell).
 * Gray background with the white document page centered.
 * On print, the background becomes white and the page fills the page.
 */
export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-100 print:overflow-visible print:bg-white">
      {children}
    </div>
  );
}
