"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Loader2, Volume2 } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   VOICE AGENT BUTTON — header mic that listens + speaks, no popup UI

   Tap → mic turns green + starts listening (Web Speech API).
   On speech end → transcript sent to /api/assistant.
   Response is spoken via TTS. Action cards auto-execute:
     - link     → router.push(href)
     - button/confirm → POST to endpoint, speak result
   A tiny inline transcript toast appears under the header while listening
   so the user sees their words being captured. That's it — no chat sheet.
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
        .replace(/[📦✅⚠️📋💰💵💸👷🔧📊🚚📝❌⏳🎉🔔📍🔄➕🎤•↳]/g, "")
        .replace(/\n{3,}/g, "\n\n")
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

  // ── Auto-execute action cards from the assistant response ──
  const runCards = useCallback(
    (cards?: ActionCard[]) => {
      if (!cards || cards.length === 0) return;
      const card = cards[0];
      if (!card) return;
      if (card.type === "link" && card.href) {
        router.push(card.href);
        return;
      }
      if (
        (card.type === "button" || card.type === "confirm") &&
        card.endpoint &&
        card.endpoint !== "/api/assistant"
      ) {
        fetch(card.endpoint, {
          method: card.method || "POST",
          headers: { "Content-Type": "application/json" },
          body: card.body ? JSON.stringify(card.body) : undefined,
        }).catch(() => {});
      }
    },
    [router],
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
          body: JSON.stringify({ text: text.trim() }),
        });
        const data = await res.json();
        const responseText = data.text || "Sorry, samajh nahi aaya.";
        runCards(data.cards);
        speak(responseText);
      } catch {
        speak("Network error. Dobara try karein.");
      }
    },
    [runCards, speak],
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
      // Guard against double-submit (onend can fire twice on some browsers)
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
    </>
  );
}
