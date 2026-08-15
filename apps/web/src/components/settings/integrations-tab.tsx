"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Calculator,
  MessageCircle,
  Mail,
  Building2,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  Trash2,
  Plug,
  Power,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useConfirm } from "@/lib/use-confirm";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Calculator,
  MessageCircle,
  Mail,
  Building2,
};

interface IntegrationField {
  name: string;
  label: string;
  type: "text" | "password" | "url" | "number" | "boolean";
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string | number | boolean;
}

interface Integration {
  key: string;
  label: string;
  description: string;
  icon: string;
  fields: IntegrationField[];
  configured: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  lastVerifiedAt: string | null;
  lastVerifyError: string | null;
}

export function IntegrationsTab() {
  const [confirm, confirmDialog] = useConfirm();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, Record<string, unknown>>>({});
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIntegrations(data.integrations);
      // Initialize forms with existing config values
      const newForms: Record<string, Record<string, unknown>> = {};
      const newEnabled: Record<string, boolean> = {};
      for (const integ of data.integrations as Integration[]) {
        const formValues: Record<string, unknown> = {};
        for (const field of integ.fields) {
          const existing = integ.config[field.name];
          if (existing !== undefined && existing !== null && existing !== "" && existing !== "••••••••") {
            formValues[field.name] = existing;
          } else if (field.defaultValue !== undefined) {
            formValues[field.name] = field.defaultValue;
          } else if (field.type === "boolean") {
            formValues[field.name] = false;
          } else {
            formValues[field.name] = "";
          }
        }
        newForms[integ.key] = formValues;
        newEnabled[integ.key] = integ.enabled;
      }
      setForms(newForms);
      setEnabledMap(newEnabled);
      if (data.integrations.length > 0 && !activeKey) {
        setActiveKey(data.integrations[0].key);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, [activeKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(key: string) {
    setSaving(key);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          enabled: enabledMap[key] ?? false,
          config: forms[key] ?? {},
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`${key} configuration saved`);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  }

  async function verify(key: string) {
    setVerifying(key);
    try {
      const res = await fetch(`/api/integrations/${key}/verify`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.success) {
        toast.success(`${key} connection verified successfully`);
      } else {
        toast.error(`${key} verification failed: ${data.error}`);
      }
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(null);
    }
  }

  async function remove(key: string) {
    const ok = await confirm({
      title: `Remove ${key} configuration?`,
      description: "This will delete all stored credentials.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(key);
    try {
      const res = await fetch("/api/integrations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`${key} configuration removed`);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setDeleting(null);
    }
  }

  function updateField(key: string, fieldName: string, value: unknown) {
    setForms((prev) => ({
      ...prev,
      [key]: { ...prev[key], [fieldName]: value },
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Plug className="h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-semibold">Integrations</h3>
          <p className="text-xs text-muted-foreground">
            Configure external service connections. Credentials are encrypted at rest.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {integrations.map((integ) => {
          const Icon = ICONS[integ.icon] ?? Plug;
          const isActive = activeKey === integ.key;
          const isVerified = integ.lastVerifiedAt && !integ.lastVerifyError;
          const hasError = integ.lastVerifyError;

          return (
            <Card key={integ.key} className={isActive ? "ring-2 ring-primary" : ""}>
              <CardContent className="p-4">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="rounded-lg border bg-muted/50 p-2 shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{integ.label}</span>
                        {integ.enabled ? (
                          <Badge variant="success" className="text-[10px]">
                            <Power className="h-2.5 w-2.5 mr-0.5" /> Enabled
                          </Badge>
                        ) : integ.configured ? (
                          <Badge variant="muted" className="text-[10px]">Disabled</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Not configured</Badge>
                        )}
                        {isVerified && (
                          <Badge variant="success" className="text-[10px]">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Verified
                          </Badge>
                        )}
                        {hasError && (
                          <Badge variant="danger" className="text-[10px]">
                            <XCircle className="h-2.5 w-2.5 mr-0.5" /> Error
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{integ.description}</p>
                      {hasError && (
                        <p className="text-xs text-destructive mt-1 font-mono">{integ.lastVerifyError}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveKey(isActive ? null : integ.key)}
                  >
                    {isActive ? "Hide" : "Configure"}
                  </Button>
                </div>

                {/* Config form */}
                {isActive && (
                  <div className="mt-4 border-t pt-4 space-y-3">
                    {/* Enable/disable toggle */}
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Enable this integration</Label>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabledMap[integ.key] ?? false}
                        onClick={() => setEnabledMap((prev) => ({ ...prev, [integ.key]: !prev[integ.key] }))}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          enabledMap[integ.key] ? "bg-primary" : "bg-input"
                        }`}
                      >
                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition-transform ${
                          enabledMap[integ.key] ? "translate-x-4" : "translate-x-0"
                        }`} />
                      </button>
                    </div>

                    {/* Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {integ.fields.map((field) => {
                        const value = forms[integ.key]?.[field.name] ?? "";
                        const isMasked = value === "••••••••";

                        if (field.type === "boolean") {
                          return (
                            <div key={field.name} className="col-span-full flex items-center justify-between">
                              <div>
                                <Label className="text-xs">{field.label}</Label>
                                {field.helpText && <p className="text-[10px] text-muted-foreground mt-0.5">{field.helpText}</p>}
                              </div>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={Boolean(value)}
                                onClick={() => updateField(integ.key, field.name, !value)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                                  value ? "bg-primary" : "bg-input"
                                }`}
                              >
                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition-transform ${
                                  value ? "translate-x-4" : "translate-x-0"
                                }`} />
                              </button>
                            </div>
                          );
                        }

                        return (
                          <div key={field.name} className="space-y-1">
                            <Label className="text-xs">
                              {field.label}
                              {field.required && <span className="text-destructive ml-0.5">*</span>}
                            </Label>
                            <Input
                              type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                              value={isMasked ? "" : String(value)}
                              placeholder={isMasked ? "•••••••• (unchanged)" : field.placeholder ?? ""}
                              onChange={(e) => updateField(integ.key, field.name, e.target.value)}
                              className="h-8 text-xs"
                            />
                            {field.helpText && <p className="text-[10px] text-muted-foreground">{field.helpText}</p>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => save(integ.key)}
                        disabled={saving === integ.key}
                      >
                        {saving === integ.key ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => verify(integ.key)}
                        disabled={verifying === integ.key || !enabledMap[integ.key]}
                      >
                        {verifying === integ.key ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                        Test Connection
                      </Button>
                      {integ.configured && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove(integ.key)}
                          disabled={deleting === integ.key}
                          className="text-destructive hover:text-destructive"
                        >
                          {deleting === integ.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {confirmDialog}
    </div>
  );
}
