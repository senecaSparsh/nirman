"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Loader2, Volume2, Check, X } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   VOICE AGENT BUTTON — header mic that listens + speaks, no chat sheet

   Tap → mic turns green + starts listening (Web Speech API).
   On speech end → transcript sent to /api/assistant with conversation context.
   Response is spoken via TTS. Then:

   1. If response has needsInput → assistant asked a follow-up question.
      Auto-start listening again after TTS ends so user can answer.

   2. If response has an action card → show confirmation popup.
      User taps Confirm → action runs (navigate or API call).
      User taps Cancel → popup dismissed.

   3. If response has hasMoreSteps → multi-step task. After confirming
      step 1, the assistant will guide through step 2, etc.

   Conversation context (history + current task state) is maintained
   client-side and sent with each request so the API is stateless.
   ═══════════════════════════════════════════════════════════════════════════ */

interface ActionCard {
  type: "link" | "button" | "confirm";
  label: string;
  href?: string;
  endpoint?: string;
  method?: string;
  body?: Record<string, unknown>;
  variant?: "primary" | "secondary" | "danger";
}

interface ConversationContext {
  history: { role: "user" | "assistant"; text: string; intent?: string; entities?: Record<string, unknown> }[];
  currentTask?: {
    intent: string;
    entities: Record<string, unknown>;
    missingSlots: string[];
    steps?: { intent: string; label: string; done: boolean }[];
    currentStep?: number;
    originalText: string;
  };
}

// ── Minimal Web Speech API types ──
interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionEvent {
  results: {
    length: number;
    [index: number]: {
      length: number;
      [index: number]: SpeechRecognitionResult;
      isFinal: boolean;
    };
  };
  resultIndex: number;
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type Phase = "idle" | "listening" | "thinking" | "speaking";

export function VoiceAgentButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [voiceLang] = useState<"hi-IN" | "en-IN">("hi-IN");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef("");
  const autoSubmittedRef = useRef(false);

  // ── Conversation context (maintained client-side) ──
  const contextRef = useRef<ConversationContext>({ history: [] });

  // ── Confirmation popup state ──
  const [pendingAction, setPendingAction] = useState<{
    card: ActionCard;
    responseText: string;
  } | null>(null);
  const [executing, setExecuting] = useState(false);

  // ── Whether we should auto-listen after TTS (follow-up question) ──
  const shouldAutoListenRef = useRef(false);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // ── Speak a response via TTS, then return to idle ──
  const speak = useCallback(
    (text: string, onDone?: () => void) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        onDone?.();
        return;
      }
      const clean = text
        .replace(/\*\*/g, "")
        .replace(/[^\w\s.,!?;:'"()-]/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!clean) {
        onDone?.();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = voiceLang;
      u.rate = 1.1;
      u.pitch = 1.0;
      setPhase("speaking");
      u.onend = () => {
        setPhase("idle");
        onDone?.();
      };
      u.onerror = () => {
        setPhase("idle");
        onDone?.();
      };
      window.speechSynthesis.speak(u);
    },
    [voiceLang],
  );

  // ── Execute a confirmed action card ──
  const executeCard = useCallback(
    async (card: ActionCard) => {
      setExecuting(true);
      try {
        if (card.type === "link" && card.href) {
          router.push(card.href);
          return;
        }
        if (
          (card.type === "button" || card.type === "confirm") &&
          card.endpoint &&
          card.endpoint !== "/api/assistant"
        ) {
          const res = await fetch(card.endpoint, {
            method: card.method || "POST",
            headers: { "Content-Type": "application/json" },
            body: card.body ? JSON.stringify(card.body) : undefined,
          });
          if (res.ok) {
            speak("Ho gaya. Action complete.");
          } else {
            speak("Action fail ho gaya. Dobara try karein.");
          }
        }
      } catch {
        speak("Network error. Dobara try karein.");
      } finally {
        setExecuting(false);
        setPendingAction(null);
      }
    },
    [router, speak],
  );

  // ── Send transcript to assistant API ──
  const sendToAssistant = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setPhase("idle");
        return;
      }
      setPhase("thinking");
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            context: contextRef.current,
          }),
        });
        const data = await res.json();
        const responseText = data.text || "Sorry, samajh nahi aaya.";
        const cards: ActionCard[] | undefined = data.cards;
        const needsInput: boolean = data.needsInput ?? false;
        const hasMoreSteps: boolean = data.hasMoreSteps ?? false;

        // Update conversation context from server
        if (data.context) {
          contextRef.current = data.context;
        }

        // Determine if we should auto-listen after TTS
        shouldAutoListenRef.current = needsInput;

        // Speak the response, then handle follow-up or action
        speak(responseText, () => {
          if (needsInput) {
            // Assistant asked a follow-up question — auto-start listening
            // Small delay to let the user process the question
            setTimeout(() => {
              if (shouldAutoListenRef.current) {
                startListening();
              }
            }, 500);
          } else if (hasMoreSteps && cards && cards.length > 0) {
            // Multi-step task — show confirmation for current step
            setPendingAction({ card: cards[0]!, responseText });
          } else if (cards && cards.length > 0) {
            // Single action — show confirmation popup
            setPendingAction({ card: cards[0]!, responseText });
          }
        });
      } catch {
        speak("Network error. Dobara try karein.");
      }
    },
    [speak],
  );

  // ── Start listening ──
  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance })
        .webkitSpeechRecognition;
    if (!SR) {
      speak("Voice input not supported. Chrome ya Safari try karein.");
      return;
    }
    const recognition = new SR();
    recognition.lang = voiceLang;
    recognition.continuous = false;
    recognition.interimResults = true;
    finalTranscriptRef.current = "";
    autoSubmittedRef.current = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const first = result[0];
        if (!first) continue;
        if (result.isFinal) {
          final += first.transcript;
        } else {
          interim += first.transcript;
        }
      }
      if (final) finalTranscriptRef.current += final;
      setTranscript(finalTranscriptRef.current || interim);
    };

    recognition.onerror = () => {
      setPhase("idle");
      setTranscript("");
    };

    recognition.onend = () => {
      const text = finalTranscriptRef.current.trim();
      if (autoSubmittedRef.current) return;
      autoSubmittedRef.current = true;
      if (text) {
        sendToAssistant(text);
      } else {
        setPhase("idle");
        setTranscript("");
      }
    };

    recognitionRef.current = recognition;
    setTranscript("");
    setPhase("listening");
    try {
      recognition.start();
    } catch {
      setPhase("idle");
    }
  }, [voiceLang, sendToAssistant, speak]);

  // ── Tap handler ──
  const onTap = useCallback(() => {
    // Cancel auto-listen if user taps manually
    shouldAutoListenRef.current = false;

    if (phase === "listening") {
      recognitionRef.current?.stop();
      return;
    }
    if (phase === "speaking") {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setPhase("idle");
      return;
    }
    if (phase === "thinking") return;
    startListening();
  }, [phase, startListening]);

  // ── Visual state ──
  const isActive = phase === "listening" || phase === "speaking";
  const color = isActive
    ? "var(--color-go)"
    : phase === "thinking"
      ? "var(--color-signal-dark)"
      : "var(--color-ink-700)";
  const bgColor = isActive ? "var(--color-go)" : "transparent";

  return (
    <>
      <button
        onClick={onTap}
        aria-label={
          phase === "listening"
            ? "Stop listening"
            : phase === "speaking"
              ? "Stop speaking"
              : "Start voice command"
        }
        className="press relative grid place-items-center size-7 rounded-[0.375rem] transition-colors"
        style={{ color, backgroundColor: bgColor }}
      >
        {phase === "thinking" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : phase === "speaking" ? (
          <Volume2 className="size-4 animate-pulse" />
        ) : (
          <Mic className={`size-4 ${phase === "listening" ? "animate-pulse" : ""}`} />
        )}
        {/* Listening pulse ring */}
        {phase === "listening" && (
          <span
            className="absolute inset-0 rounded-[0.375rem] animate-ping opacity-50"
            style={{ backgroundColor: "var(--color-go)" }}
          />
        )}
      </button>

      {/* ── Inline transcript toast (no chat sheet) ── */}
      {transcript && (phase === "listening" || phase === "thinking") && (
        <div
          className="fixed left-1/2 -translate-x-1/2 top-14 z-40 max-w-[90%] rounded-full px-3 py-1.5 text-[0.6875rem] font-medium shadow-lg"
          style={{
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink-900)",
            border: "1px solid var(--color-line)",
          }}
        >
          {phase === "listening" && (
            <span
              className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full align-middle"
              style={{ backgroundColor: "var(--color-go)" }}
            />
          )}
          {transcript}
        </div>
      )}

      {/* ── Confirmation popup ── */}
      {pendingAction && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => !executing && setPendingAction(null)}
        >
          <div
            className="w-full max-w-[30rem] rounded-t-2xl p-4 pb-safe animate-in slide-in-from-bottom"
            style={{
              backgroundColor: "var(--color-paper)",
              border: "1px solid var(--color-line)",
              borderBottom: "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />

            {/* Response text (what Sahayak said) */}
            <p
              className="mb-3 text-[0.8125rem] leading-relaxed whitespace-pre-wrap"
              style={{ color: "var(--color-ink-800)" }}
            >
              {pendingAction.responseText}
            </p>

            {/* Action label */}
            <div
              className="mb-4 rounded-lg p-3"
              style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-line)" }}
            >
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-500)" }}>
                {pendingAction.card.type === "link" ? "Open page" : "Execute action"}
              </p>
              <p className="text-[0.875rem] font-medium" style={{ color: "var(--color-ink-950)" }}>
                {pendingAction.card.label}
              </p>
            </div>

            {/* Confirm / Cancel buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPendingAction(null);
                  // Reset conversation context when user cancels
                  contextRef.current = { history: [] };
                }}
                disabled={executing}
                className="press flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[0.8125rem] font-semibold disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-ink-700)",
                  border: "1px solid var(--color-line)",
                }}
              >
                <X className="size-4" />
                Cancel
              </button>
              <button
                onClick={() => executeCard(pendingAction.card)}
                disabled={executing}
                className="press flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[0.8125rem] font-semibold text-white disabled:opacity-50"
                style={{
                  backgroundColor:
                    pendingAction.card.variant === "danger"
                      ? "var(--color-stop)"
                      : "var(--color-go)",
                }}
              >
                {executing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {executing ? "Executing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
