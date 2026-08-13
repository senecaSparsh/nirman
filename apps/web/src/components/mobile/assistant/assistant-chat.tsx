"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Send, X, Sparkles, Loader2, MessageCircle } from "lucide-react";
import { SUGGESTION_CHIPS } from "@/lib/assistant/nlu";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ActionCard {
  type: "link" | "button" | "confirm";
  label: string;
  href?: string;
  endpoint?: string;
  method?: string;
  body?: Record<string, unknown>;
  variant?: "primary" | "secondary" | "danger";
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards?: ActionCard[];
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEB SPEECH API TYPES (minimal)
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// ASSISTANT CHAT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Namaste! 👋 Main Sahayak hoon — aapka assistant. Bataiye kya help karu? Type karo ya bol lo 🎤",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState<"hi-IN" | "en-IN">("hi-IN");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const router = useRouter();

  // ── Auto-scroll to bottom on new message ──
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // ── Focus input when opened ──
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  // ── Initialize speech recognition ──
  const initRecognition = useCallback((): SpeechRecognitionInstance | null => {
    if (typeof window === "undefined") return null;
    const SR = (window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    }).SpeechRecognition || (window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    }).webkitSpeechRecognition;
    if (!SR) return null;

    const recognition = new SR();
    recognition.lang = voiceLang;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result[0]) {
          transcript += result[0].transcript;
        }
      }
      setInput(transcript);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    return recognition;
  }, [voiceLang]);

  // ── Send message to assistant API ──
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: text.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: data.text || "Sorry, samajh nahi aaya.",
        cards: data.cards,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: "Network error. Dobara try karein.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // ── Execute action card (button/confirm) ──
  const executeCard = useCallback(async (card: ActionCard) => {
    if (card.type === "link" && card.href) {
      setOpen(false);
      router.push(card.href);
      return;
    }

    if (card.type === "button" && card.endpoint === "/api/assistant") {
      // It's a redirect to another assistant query (e.g., "Help" button)
      if (card.body?.text) {
        sendMessage(card.body.text as string);
      }
      return;
    }

    if ((card.type === "button" || card.type === "confirm") && card.endpoint) {
      setLoading(true);
      try {
        const res = await fetch(card.endpoint, {
          method: card.method || "POST",
          headers: { "Content-Type": "application/json" },
          body: card.body ? JSON.stringify(card.body) : undefined,
        });
        const data = await res.json();

        let resultText = "✅ Ho gaya!";
        if (data.error) {
          resultText = `❌ Error: ${data.error}`;
        } else if (data.poNumber) {
          resultText = `✅ ${data.poNumber} approved ho gaya!`;
        } else if (data.reqNumber) {
          resultText = `✅ ${data.reqNumber} approved ho gayi!`;
        } else if (data.ok) {
          resultText = `✅ Successfully done!`;
        } else if (data.id) {
          resultText = `✅ Created successfully!`;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: resultText,
            timestamp: Date.now(),
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: "❌ Action fail ho gaya. Dobara try karein.",
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    }
  }, [router, sendMessage]);

  // ── Voice input toggle ──
  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = initRecognition();
    if (!recognition) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: "Voice input is not supported on this browser. Chrome ya Safari try karein.",
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    recognitionRef.current = recognition;
    setInput("");
    setListening(true);
    recognition.start();
  }, [listening, initRecognition]);

  // ── Handle Enter key ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ── Toggle voice language ──
  const toggleVoiceLang = () => {
    setVoiceLang((prev) => (prev === "hi-IN" ? "en-IN" : "hi-IN"));
  };

  return (
    <>
      {/* ── Floating button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-20 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
          style={{
            backgroundColor: "var(--color-signal)",
            color: "var(--color-ink-950)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
          aria-label="Open assistant"
        >
          <MessageCircle className="h-5 w-5" />
          <span
            className="absolute -top-1 -right-1 flex h-3 w-3"
          >
            <span className="absolute h-3 w-3 animate-ping rounded-full opacity-75" style={{ backgroundColor: "var(--color-go)" }} />
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: "var(--color-go)" }} />
          </span>
        </button>
      )}

      {/* ── Chat sheet ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "var(--color-paper-2)" }}>
          {/* ── Header ── */}
          <div
            className="flex items-center gap-3 px-4 py-3 border-b"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-line)",
            }}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--color-signal)" }}
            >
              <Sparkles className="h-4 w-4" style={{ color: "var(--color-ink-950)" }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: "var(--color-ink-950)" }}>
                Sahayak
              </p>
              <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
                Owner Assistant · Hindi/English
              </p>
            </div>
            {/* Voice language toggle */}
            <button
              onClick={toggleVoiceLang}
              className="rounded-full px-2 py-1 text-[0.5625rem] font-bold"
              style={{
                backgroundColor: voiceLang === "hi-IN" ? "var(--color-signal)" : "var(--color-line)",
                color: voiceLang === "hi-IN" ? "var(--color-ink-950)" : "var(--color-ink-600)",
              }}
            >
              {voiceLang === "hi-IN" ? "हिं" : "EN"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ color: "var(--color-ink-600)" }}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* ── Messages ── */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onCardClick={executeCard} />
            ))}
            {loading && (
              <div className="flex items-center gap-2" style={{ color: "var(--color-ink-500)" }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs">Soch raha hoon...</span>
              </div>
            )}

            {/* ── Suggestion chips (only on first few messages) ── */}
            {messages.length <= 2 && !loading && (
              <div className="pt-2">
                <p className="text-[0.5625rem] font-semibold mb-2" style={{ color: "var(--color-ink-500)" }}>
                  QUICK SUGGESTIONS
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTION_CHIPS.map((chip) => (
                    <button
                      key={chip.text}
                      onClick={() => sendMessage(chip.text)}
                      className="rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium transition-colors active:scale-95"
                      style={{
                        borderColor: "var(--color-line)",
                        backgroundColor: "var(--color-paper)",
                        color: "var(--color-ink-700)",
                      }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Input bar ── */}
          <div
            className="border-t px-3 py-2.5 pb-safe"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-line)",
            }}
          >
            {/* ── Voice transcript indicator ── */}
            {listening && (
              <div className="mb-2 flex items-center gap-2 text-xs" style={{ color: "var(--color-signal-dark)" }}>
                <span className="flex h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: "var(--color-signal)" }} />
                Sun raha hoon... ({voiceLang === "hi-IN" ? "Hindi" : "English"})
              </div>
            )}
            <div className="flex items-center gap-2">
              {/* Voice button */}
              <button
                onClick={toggleVoice}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 ${
                  listening ? "animate-pulse" : ""
                }`}
                style={{
                  backgroundColor: listening ? "var(--color-signal)" : "var(--color-paper-2)",
                  color: listening ? "var(--color-ink-950)" : "var(--color-ink-600)",
                  border: listening ? "none" : "1px solid var(--color-line)",
                }}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>

              {/* Text input */}
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type karo ya bol lo..."
                className="flex-1 rounded-full border px-4 py-2.5 text-sm outline-none"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-paper-2)",
                  color: "var(--color-ink-950)",
                }}
                disabled={loading}
              />

              {/* Send button */}
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-40"
                style={{
                  backgroundColor: input.trim() ? "var(--color-signal)" : "var(--color-line)",
                  color: input.trim() ? "var(--color-ink-950)" : "var(--color-ink-400)",
                }}
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE BUBBLE
// ═══════════════════════════════════════════════════════════════════════════

function MessageBubble({
  message,
  onCardClick,
}: {
  message: ChatMessage;
  onCardClick: (card: ActionCard) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Bubble */}
        <div
          className="rounded-2xl px-3.5 py-2.5 text-[0.8125rem] whitespace-pre-wrap"
          style={{
            backgroundColor: isUser ? "var(--color-signal)" : "var(--color-paper)",
            color: isUser ? "var(--color-ink-950)" : "var(--color-ink-900)",
            borderRadius: isUser ? "1rem 0.25rem 1rem 1rem" : "0.25rem 1rem 1rem 1rem",
            border: isUser ? "none" : "1px solid var(--color-line)",
          }}
        >
          {message.text}
        </div>

        {/* Action cards */}
        {message.cards && message.cards.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.cards.map((card, i) => (
              <button
                key={i}
                onClick={() => onCardClick(card)}
                className="rounded-full px-3 py-1.5 text-[0.6875rem] font-semibold transition-all active:scale-95"
                style={cardStyle(card.variant)}
              >
                {card.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function cardStyle(variant?: "primary" | "secondary" | "danger") {
  switch (variant) {
    case "primary":
      return {
        backgroundColor: "var(--color-signal)",
        color: "var(--color-ink-950)",
      };
    case "danger":
      return {
        backgroundColor: "var(--color-stop)",
        color: "white",
      };
    default:
      return {
        backgroundColor: "var(--color-paper)",
        color: "var(--color-ink-700)",
        border: "1px solid var(--color-line)",
      };
  }
}
