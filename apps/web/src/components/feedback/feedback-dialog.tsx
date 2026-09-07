"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  Camera,
  Mic,
  MicOff,
  Send,
  Loader2,
  X,
  Trash2,
  Image as ImageIcon,
  AlertCircle,
  Lightbulb,
  Smile,
  HelpCircle,
  MessageSquare,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════
 * INSTANT FEEDBACK DIALOG
 *
 * Available on every page via a floating button. When opened:
 *   1. Auto-captures a screenshot of the current page (html-to-image)
 *   2. Lets the user record a voice note (MediaRecorder API)
 *   3. Lets the user write free-text feedback
 *   4. On submit, uploads screenshot + voice via /api/uploads, then
 *      POSTs the feedback to /api/feedback — which routes it to the
 *      DEVELOPER (god-mode) account only.
 * ═══════════════════════════════════════════════════════════════════
 */

const CATEGORIES = [
  { key: "BUG", label: "Bug", icon: AlertCircle, color: "text-danger" },
  { key: "FEATURE", label: "Feature Request", icon: Lightbulb, color: "text-warning" },
  { key: "UX", label: "UX / Design", icon: Smile, color: "text-info" },
  { key: "QUESTION", label: "Question", icon: HelpCircle, color: "text-muted-foreground" },
  { key: "PRAISE", label: "Praise", icon: ImageIcon, color: "text-success" },
  { key: "OTHER", label: "Other", icon: MessageSquare, color: "text-muted-foreground" },
] as const;

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<string>("OTHER");
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotUploading, setScreenshotUploading] = useState(false);
  const [screenshotUploadId, setScreenshotUploadId] = useState<string | null>(null);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [voiceUploadId, setVoiceUploadId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const uploadScreenshot = useCallback(async (dataUrl: string) => {
    setScreenshotUploading(true);
    try {
      // Convert data URL to Blob
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append("file", blob, `feedback-screenshot-${Date.now()}.png`);

      const uploadRes = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const data = await uploadRes.json();
      setScreenshotUploadId(data.uploadId);
    } catch (err) {
      console.error("[Feedback] Screenshot upload failed:", err);
      toast.error("Could not attach screenshot — you can still submit text feedback.");
    } finally {
      setScreenshotUploading(false);
    }
  }, []);

  const captureScreenshot = useCallback(async () => {
    setCapturingScreenshot(true);
    try {
      const { toPng } = await import("html-to-image");
      // Capture the main content area (or body as fallback).
      // We temporarily hide the feedback dialog itself from the screenshot.
      const target = document.querySelector("main") ?? document.body;
      const dataUrl = await toPng(target as HTMLElement, {
        quality: 0.7,
        pixelRatio: 1.5,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--color-background") || "#ffffff",
        filter: (node) => {
          // Exclude the feedback dialog and floating button from the screenshot
          if (node instanceof HTMLElement) {
            return !node.closest("[data-feedback-dialog]") && !node.closest("[data-feedback-button]");
          }
          return true;
        },
      });
      setScreenshotDataUrl(dataUrl);
      // Auto-upload the screenshot
      await uploadScreenshot(dataUrl);
    } catch (err) {
      console.error("[Feedback] Screenshot capture failed:", err);
      // Screenshot is optional — don't block the user
    } finally {
      setCapturingScreenshot(false);
    }
  }, [uploadScreenshot]);

  // ── Auto-capture screenshot when dialog opens ──────────────
  useEffect(() => {
    if (!open) return;
    // Reset state on open
    setMessage("");
    setCategory("OTHER");
    setScreenshotDataUrl(null);
    setScreenshotUploadId(null);
    setAudioBlob(null);
    setAudioUrl(null);
    setVoiceUploadId(null);
    setIsRecording(false);
    setRecordingTime(0);

    // Auto-capture the page screenshot. We capture the <main> element.
    // html-to-image is dynamically imported so it doesn't bloat the bundle.
    captureScreenshot();
  }, [open, captureScreenshot]);

  // ── Voice recording ────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick the best supported audio MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: mimeType || "audio/webm",
        });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        // Stop all tracks
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      console.error("[Feedback] Microphone access failed:", err);
      toast.error("Could not access microphone. Check browser permissions.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const deleteRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setVoiceUploadId(null);
  }, [audioUrl]);

  // Upload voice note when recording is done
  useEffect(() => {
    if (!audioBlob || voiceUploadId) return;
    (async () => {
      setVoiceUploading(true);
      try {
        const ext = audioBlob.type.includes("webm") ? "webm" : "mp4";
        const formData = new FormData();
        formData.append("file", audioBlob, `feedback-voice-${Date.now()}.${ext}`);

        const res = await fetch("/api/uploads", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        setVoiceUploadId(data.uploadId);
      } catch (err) {
        console.error("[Feedback] Voice upload failed:", err);
        toast.error("Could not upload voice note.");
      } finally {
        setVoiceUploading(false);
      }
    })();
  }, [audioBlob, voiceUploadId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // ── Submit feedback ────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!message.trim()) {
      toast.error("Please write your feedback before submitting.");
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          category,
          screenshotUploadId: screenshotUploadId ?? undefined,
          voiceUploadId: voiceUploadId ?? undefined,
          currentUrl: window.location.href,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to submit feedback");
      }
      toast.success("Feedback sent! Thank you — the team will review it.");
      onOpenChange(false);
    } catch (err) {
      console.error("[Feedback] Submit failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to submit feedback.");
    } finally {
      setSubmitting(false);
    }
  }, [message, category, screenshotUploadId, voiceUploadId, submitting, onOpenChange]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const canSubmit = message.trim().length > 0 && !submitting && !screenshotUploading && !voiceUploading;

  return (
    <div data-feedback-dialog>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Send Feedback"
        description="Snapshot captured automatically. Add a voice note or write what you feel — it goes straight to the developer."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting} disabled={!canSubmit}>
              <Send className="size-4" />
              Send Feedback
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* ── Category selector ─────────────────────────── */}
          <div>
            <label className="mb-1.5 block text-label text-faint">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const active = category === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setCategory(cat.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                      active
                        ? "border-brand bg-brand-soft text-brand-strong"
                        : "border-input bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-3.5", active ? cat.color : "text-faint")} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Screenshot preview ────────────────────────── */}
          <div>
            <label className="mb-1.5 block text-label text-faint">
              Screenshot <span className="normal-case text-faint/70">(auto-captured)</span>
            </label>
            {capturingScreenshot ? (
              <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border bg-muted/50">
                <div className="flex items-center gap-2 text-meta text-muted-foreground">
                  <Camera className="size-4 animate-pulse" />
                  Capturing screen…
                </div>
              </div>
            ) : screenshotDataUrl ? (
              <div className="group relative overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL screenshot, not optimizable */}
                <img
                  src={screenshotDataUrl}
                  alt="Feedback screenshot"
                  className="max-h-48 w-full object-contain bg-muted/30"
                />
                {screenshotUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setScreenshotDataUrl(null);
                    setScreenshotUploadId(null);
                  }}
                  className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  aria-label="Remove screenshot"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={captureScreenshot}
                className="flex h-20 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 text-meta text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                <Camera className="size-4" />
                Retake screenshot
              </button>
            )}
          </div>

          {/* ── Voice recording ───────────────────────────── */}
          <div>
            <label className="mb-1.5 block text-label text-faint">Voice note <span className="normal-case text-faint/70">(optional)</span></label>
            {audioUrl ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card p-2.5">
                <audio src={audioUrl} controls className="h-8 flex-1" />
                {voiceUploading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                <button
                  type="button"
                  onClick={deleteRecording}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-danger"
                  aria-label="Delete voice note"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ) : isRecording ? (
              <div className="flex items-center gap-3 rounded-md border border-danger/30 bg-danger/5 p-2.5">
                <span className="flex size-2.5 animate-pulse rounded-full bg-danger" />
                <span className="text-meta font-medium text-danger">Recording… {formatTime(recordingTime)}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={stopRecording}
                  className="ml-auto"
                >
                  <MicOff className="size-3.5" />
                  Stop
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 text-meta text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                <Mic className="size-4" />
                Record voice note
              </button>
            )}
          </div>

          {/* ── Text feedback ─────────────────────────────── */}
          <div>
            <label className="mb-1.5 block text-label text-faint">
              Your feedback <span className="normal-case text-danger">*</span>
            </label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's on your mind? Describe the issue, suggestion, or what you like…"
              rows={4}
              maxLength={5000}
              autoFocus
            />
            <div className="mt-1 text-right text-caption text-faint">
              {message.length} / 5000
            </div>
          </div>

          {/* ── Context info ──────────────────────────────── */}
          <div className="rounded-md bg-muted/40 px-3 py-2 text-caption text-muted-foreground">
            <span className="font-medium">Page:</span> {typeof window !== "undefined" ? window.location.pathname : "/"}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
