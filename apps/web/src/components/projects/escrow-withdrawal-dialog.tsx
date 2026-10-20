"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Landmark } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

/**
 * Record a certified RERA escrow withdrawal (Sec 4(2)(l)(D)). The three
 * signatory names are mandatory — the bank and the auditor both ask for the
 * certificate; the system stores who certified and posts the bank transfer
 * (Dr Cash / Cr Escrow 1060) in the same transaction.
 */
export function EscrowWithdrawalDialog({
  open,
  onOpenChange,
  projectId,
  escrowBalance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  escrowBalance: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [engineerName, setEngineerName] = useState("");
  const [architectName, setArchitectName] = useState("");
  const [caName, setCaName] = useState("");
  const [certificateUrl, setCertificateUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const amt = Number(amount);
  const overBalance = amt > 0 && amt > escrowBalance;

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/escrow-withdrawal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          purpose,
          engineerName,
          architectName,
          caName,
          certificateUrl: certificateUrl || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to record withdrawal");
      toast.success(`Withdrawal #${data.withdrawalNo} recorded — escrow → bank`);
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record withdrawal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Certified escrow withdrawal" description={`Escrow balance ${formatCurrency(escrowBalance)} — Sec 4(2)(l)(D)`}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Certified escrow withdrawal</h3>
        </div>
        <p className="text-caption text-muted-foreground">
          Escrow balance {formatCurrency(escrowBalance)}. Every withdrawal under Sec 4(2)(l)(D) is certified by
          the project&apos;s engineer, architect, and a practising CA — all three names are required.
        </p>
        <div>
          <Label htmlFor="ew-amount">Amount (₹)</Label>
          <Input id="ew-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          {overBalance && <p className="mt-1 text-xs text-destructive">Exceeds the ledgered escrow balance — the withdrawal will be refused.</p>}
        </div>
        <div>
          <Label htmlFor="ew-purpose">Purpose</Label>
          <Textarea id="ew-purpose" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Tower B slab — certified construction cost" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="ew-eng">Engineer</Label>
            <Input id="ew-eng" value={engineerName} onChange={(e) => setEngineerName(e.target.value)} placeholder="Certifying engineer" />
          </div>
          <div>
            <Label htmlFor="ew-arch">Architect</Label>
            <Input id="ew-arch" value={architectName} onChange={(e) => setArchitectName(e.target.value)} placeholder="Certifying architect" />
          </div>
          <div>
            <Label htmlFor="ew-ca">CA</Label>
            <Input id="ew-ca" value={caName} onChange={(e) => setCaName(e.target.value)} placeholder="Practising CA" />
          </div>
        </div>
        <div>
          <Label htmlFor="ew-cert">Certificate link (optional)</Label>
          <Input id="ew-cert" value={certificateUrl} onChange={(e) => setCertificateUrl(e.target.value)} placeholder="https://… signed certificate / Form 3" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="flex-1"
            disabled={submitting || overBalance || !(amt > 0) || !purpose.trim() || !engineerName.trim() || !architectName.trim() || !caName.trim()}
            onClick={submit}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Record withdrawal
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
