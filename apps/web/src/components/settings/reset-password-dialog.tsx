"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

/**
 * ResetPasswordDialog — manager resets a user's password.
 *
 * Calls POST /api/users/[id]/reset-password. The API:
 *  - Enforces the company's password minimum length
 *  - Sets mustChangePassword = true by default (user picks their own on next login)
 *  - Revokes all existing sessions for the user
 *  - Logs a USER_PASSWORD_RESET audit entry
 */
export function ResetPasswordDialog({
  userId,
  userName,
  onClose,
  onSaved,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mustChange, setMustChange] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleReset() {
    if (!password.trim()) {
      toast.error("Enter a new password");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, mustChange }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reset password");
      toast.success("Password reset", {
        description: `${userName}'s password has been updated. All active sessions were revoked.${mustChange ? " They will be prompted to set a new password on next login." : ""}`,
      });
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Reset Password — ${userName}`}
      description="Set a new password for this user. Communicate it to them in person or by phone — never via email or SMS."
      className="max-w-sm"
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>New Password *</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoFocus
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={mustChange}
            onChange={(e) => setMustChange(e.target.checked)}
            className="rounded border-input"
          />
          <span className="text-caption text-foreground">Require password change on next login</span>
        </label>

        <div className="rounded-md border border-warning/40 bg-warning/5 p-2.5">
          <p className="text-caption text-foreground">
            <KeyRound className="inline size-3 mr-1" />
            All active sessions for this user will be revoked. They will need to sign in again with the new password.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" size="sm" onClick={handleReset} disabled={saving || !password.trim()}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
            Reset Password
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
