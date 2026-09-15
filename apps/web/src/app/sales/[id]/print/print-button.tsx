"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Print / Save PDF
    </Button>
  );
}

export function CloseButton() {
  const router = useRouter();
  // Inside the mobile DocumentViewer iframe the overlay's own X closes —
  // hide this duplicate so there aren't two close buttons.
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    setFramed(window.self !== window.top);
  }, []);
  if (framed) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => (window.history.length > 1 ? router.back() : window.close())}
    >
      <X className="h-4 w-4" />
      Close
    </Button>
  );
}
