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

  // ── Silence detection refs ──
  // Tracks when we last received speech data. If no new speech for
  // SILENCE_MS after speech has started, we auto-stop and submit.
  const lastSpeechTimeRef = useRef(0);
  const hasSpeechStartedRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tunables
  const SILENCE_MS = 1800; // 1.8s of silence after speech → auto-submit
  const MAX_LISTEN_MS = 20000; // 20s hard cap — safety net
  const MIN_LISTEN_MS = 800; // don't auto-submit in the first 800ms

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
      if (maxListenTimerRef.current) clearTimeout(maxListenTimerRef.current);
    };
  }, []);

  // ── Deduplicate repeated phrases in a transcript ──
  // If the user stutters or repeats ("approve approve PO-0011 PO-0011"),
  // collapse to "approve PO-0011".
  function deduplicate(text: string): string {
    const words = text.trim().split(/\s+/);
    if (words.length < 4) return text.trim(); // too short to bother

    // Remove consecutive duplicate words ("the the" → "the")
    const deduped: string[] = [];
    for (const w of words) {
      const prev = deduped[deduped.length - 1];
      if (w.toLowerCase() !== prev?.toLowerCase()) {
        deduped.push(w);
      }
    }

    // Remove consecutive duplicate phrases (2-3 word repeats)
    // "approve po approve po" → "approve po"
    const result: string[] = [];
    for (let i = 0; i < deduped.length; i++) {
      // Try 2-word phrase
      const phrase2 = deduped.slice(i, i + 2).join(" ").toLowerCase();
      const next2 = deduped.slice(i + 2, i + 4).join(" ").toLowerCase();
      if (phrase2 === next2 && phrase2.length > 3) {
        result.push(deduped[i]!, deduped[i + 1]!);
        i += 3; // skip the duplicate pair
        continue;
      }
      // Try 3-word phrase
      const phrase3 = deduped.slice(i, i + 3).join(" ").toLowerCase();
      const next3 = deduped.slice(i + 3, i + 6).join(" ").toLowerCase();
      if (phrase3 === next3 && phrase3.length > 5) {
        result.push(deduped[i]!, deduped[i + 1]!, deduped[i + 2]!);
        i += 5; // skip the duplicate triplet
        continue;
      }
      result.push(deduped[i]!);
    }

    return result.join(" ");
  }

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
  // Uses continuous=true with a silence detector:
  //   - Keeps listening through brief pauses (user thinking mid-sentence)
  //   - Auto-stops after SILENCE_MS of silence once speech has started
  //   - Hard cap at MAX_LISTEN_MS as a safety net
  //   - Deduplicates repeated words/phrases in the final transcript
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

    // Reset state
    const recognition = new SR();
    recognition.lang = voiceLang;
    recognition.continuous = true; // keep listening through pauses
    recognition.interimResults = true;
    finalTranscriptRef.current = "";
    autoSubmittedRef.current = false;
    hasSpeechStartedRef.current = false;
    lastSpeechTimeRef.current = Date.now();

    const listenStartTime = Date.now();

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

      // Track that speech has started (we've received some data)
      const currentText = finalTranscriptRef.current || interim;
      if (currentText.trim().length > 0) {
        hasSpeechStartedRef.current = true;
        lastSpeechTimeRef.current = Date.now();
      }

      setTranscript(currentText);
    };

    recognition.onerror = () => {
      clearTimers();
      setPhase("idle");
      setTranscript("");
    };

    recognition.onend = () => {
      clearTimers();
      if (autoSubmittedRef.current) return;
      autoSubmittedRef.current = true;

      // Deduplicate repeated phrases before submitting
      const rawText = finalTranscriptRef.current.trim();
      const cleanText = deduplicate(rawText);

      if (cleanText) {
        sendToAssistant(cleanText);
      } else {
        setPhase("idle");
        setTranscript("");
      }
    };

    // ── Helper: clear all timers ──
    function clearTimers() {
      if (silenceTimerRef.current) {
        clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (maxListenTimerRef.current) {
        clearTimeout(maxListenTimerRef.current);
        maxListenTimerRef.current = null;
      }
    }

    // ── Helper: stop and submit (called by silence detector or timeout) ──
    function stopAndSubmit() {
      if (autoSubmittedRef.current) return;
      autoSubmittedRef.current = true;
      clearTimers();
      try {
        recognition.stop();
      } catch {
        // already stopped
      }
    }

    // ── Silence detector: check every 300ms if user has gone quiet ──
    silenceTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - listenStartTime;
      const silenceDuration = Date.now() - lastSpeechTimeRef.current;

      // Only auto-stop if:
      // 1. Speech has started (we've received at least some words)
      // 2. We've been listening for at least MIN_LISTEN_MS (don't cut off too early)
      // 3. Silence has lasted longer than SILENCE_MS
      if (
        hasSpeechStartedRef.current &&
        elapsed > MIN_LISTEN_MS &&
        silenceDuration > SILENCE_MS
      ) {
        stopAndSubmit();
      }
    }, 300);

    // ── Hard cap: stop after MAX_LISTEN_MS regardless ──
    maxListenTimerRef.current = setTimeout(() => {
      stopAndSubmit();
    }, MAX_LISTEN_MS);

    recognitionRef.current = recognition;
    setTranscript("");
    setPhase("listening");
    try {
      recognition.start();
    } catch {
      clearTimers();
      setPhase("idle");
    }
  }, [voiceLang, sendToAssistant, speak]);

  // ── Tap handler ──
  const onTap = useCallback(() => {
    // Cancel auto-listen if user taps manually
    shouldAutoListenRef.current = false;

    if (phase === "listening") {
      // Manual stop — clear silence timers and let onend handle submission
      if (silenceTimerRef.current) {
        clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (maxListenTimerRef.current) {
        clearTimeout(maxListenTimerRef.current);
        maxListenTimerRef.current = null;
      }
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
    if (phase === "thinking") return; // don't interrupt mid-request
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
          className="fixed left-1/2 -translate-x-1/2 top-14 z-40 max-w-[90%] rounded-2xl px-3 py-2 text-[0.6875rem] font-medium shadow-lg"
          style={{
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink-900)",
            border: "1px solid var(--color-line)",
          }}
        >
          <div className="flex items-center gap-1.5">
            {phase === "listening" && (
              <span
                className="inline-block size-1.5 animate-pulse rounded-full"
                style={{ backgroundColor: "var(--color-go)" }}
              />
            )}
            <span className="flex-1">{transcript}</span>
          </div>
          {phase === "listening" && hasSpeechStartedRef.current && (
            <div
              className="mt-1 text-[0.625rem] font-normal"
              style={{ color: "var(--color-ink-500)" }}
            >
              Bolte rahiye… ya mic tap karke submit karein
            </div>
          )}
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
