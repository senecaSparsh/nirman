"use client";

import * as React from "react";
import { Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type GeoSelection = { address: string; lat: number; lng: number };

type Suggestion = { id: string; label: string; lat: number; lng: number };

/**
 * AddressSearchField — verified-address picker.
 *
 * The committed value can ONLY come from (a) a geocoded search suggestion or
 * (b) the device's GPS + reverse geocode — free typing never commits, so a
 * fake/unverifiable address can't be saved. Typing searches; leaving the
 * field without picking reverts the text to the last committed value.
 *
 * `mobile` switches to the mobile design tokens used across /m/* forms.
 */
export function AddressSearchField({
  value,
  onPick,
  onClear,
  placeholder = "Search address…",
  disabled,
  mobile,
  autoDetect = true,
  id,
  className,
}: {
  /** The committed (verified) address string. */
  value: string;
  onPick: (sel: GeoSelection) => void;
  /** Show a clear button that empties address + coords. */
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  mobile?: boolean;
  autoDetect?: boolean;
  id?: string;
  className?: string;
}) {
  const [text, setText] = React.useState(value);
  const [suggestions, setSuggestions] = React.useState<Suggestion[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [detecting, setDetecting] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeq = React.useRef(0);

  // Keep the visible text in sync when the committed value changes externally.
  React.useEffect(() => { setText(value); }, [value]);

  // Close the dropdown on outside pointer-down.
  React.useEffect(() => {
    function onDocDown(e: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, []);

  function search(q: string) {
    const seq = ++fetchSeq.current;
    setSearching(true);
    fetch(`/api/geo/search?q=${encodeURIComponent(q)}`)
      .then(async (r) => (r.ok ? ((await r.json()) as { results: Suggestion[] }).results : []))
      .then((results) => {
        if (fetchSeq.current !== seq) return; // stale response
        setSuggestions(results);
        setOpen(true);
      })
      .catch(() => { if (fetchSeq.current === seq) setSuggestions([]); })
      .finally(() => { if (fetchSeq.current === seq) setSearching(false); });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setText(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 3) {
      setSuggestions(null);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(q.trim()), 350);
  }

  function pick(s: Suggestion) {
    setText(s.label);
    setSuggestions(null);
    setOpen(false);
    onPick({ address: s.label, lat: s.lat, lng: s.lng });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setText(value);
      setSuggestions(null);
      setOpen(false);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const first = open && suggestions && suggestions.length > 0 ? suggestions[0] : undefined;
      if (first) pick(first);
    }
  }

  // Leaving the field without picking reverts to the committed value —
  // this is what makes the address "verified only": you can't type a fake one.
  function handleBlur() {
    if (text !== value) setText(value);
  }

  async function detect() {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported on this device");
      return;
    }
    setDetecting(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
      const { latitude, longitude } = position.coords;
      let address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      try {
        const r = await fetch(`/api/geo/reverse?lat=${latitude}&lng=${longitude}`);
        if (r.ok) {
          const data = (await r.json()) as { label?: string };
          if (data.label) address = data.label;
        }
      } catch { /* non-fatal — coords are the source of truth */ }
      setText(address);
      onPick({ address, lat: latitude, lng: longitude });
      toast.success("Location captured", { description: `±${Math.round(position.coords.accuracy)}m accuracy` });
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        toast.error(
          err.code === 1
            ? "Location permission denied — enable it in browser settings."
            : "Could not get your location. Make sure GPS is on.",
        );
      } else {
        toast.error("Could not get your location");
      }
    } finally {
      setDetecting(false);
    }
  }

  const inputCls = mobile
    ? "w-full rounded-[0.625rem] border px-3 py-2.5 text-m-body outline-none"
    : undefined;

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span
            className={cn(
              "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2",
              mobile ? "" : "text-faint",
            )}
            style={mobile ? { color: "var(--color-ink-400)" } : undefined}
          >
            <Search className="size-3.5" />
          </span>
          <input
            id={id}
            type="text"
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onFocus={() => { if (suggestions?.length) setOpen(true); }}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            className={
              inputCls ??
              "w-full rounded-md border border-input bg-card pl-8 pr-8 text-foreground transition-[border-color,box-shadow] duration-100 placeholder:text-faint hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground h-11 text-[14px] sm:h-8 sm:text-[13px]"
            }
            style={mobile ? { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)", paddingLeft: "2rem" } : undefined}
          />
          {searching && (
            <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-faint" />
          )}
          {!searching && onClear && value && (
            <button
              type="button"
              onClick={() => { setText(""); onClear(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-foreground"
              aria-label="Clear address"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {autoDetect && (
          <button
            type="button"
            onClick={detect}
            disabled={disabled || detecting}
            title="Use my current GPS location"
            className={cn(
              "grid shrink-0 place-items-center rounded-md border transition-colors disabled:opacity-50",
              mobile ? "w-11 rounded-[0.625rem]" : "w-9 border-input bg-card hover:border-border-strong",
            )}
            style={mobile ? { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-600)" } : undefined}
          >
            {detecting ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
          </button>
        )}
      </div>

      {open && suggestions && (
        <div
          className={cn(
            "absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border shadow-lg",
            mobile ? "" : "border-border bg-card",
          )}
          style={mobile ? { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" } : undefined}
        >
          {suggestions.length === 0 ? (
            <p className={cn("px-3 py-2.5", mobile ? "text-m-caption" : "text-caption text-muted-foreground")}
               style={mobile ? { color: "var(--color-ink-400)" } : undefined}>
              No matching address found — try the GPS button instead.
            </p>
          ) : (
            suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onPointerDown={(e) => { e.preventDefault(); pick(s); }}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors",
                  mobile ? "active:opacity-70" : "text-[13px] hover:bg-muted",
                )}
                style={mobile ? { color: "var(--color-ink-800)" } : undefined}
              >
                <MapPin className={cn("mt-0.5 size-3.5 shrink-0", !mobile && "text-faint")}
                        style={mobile ? { color: "var(--color-ink-400)" } : undefined} />
                <span className="min-w-0 flex-1 leading-snug">{s.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
