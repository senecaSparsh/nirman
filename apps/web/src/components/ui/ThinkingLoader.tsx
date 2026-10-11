"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Check, Loader } from "lucide-react";

import { cn } from "@/lib/utils";
import { ease } from "@/lib/motion-tokens";

const SPRING_POP = { type: "spring" as const, stiffness: 420, damping: 18, mass: 0.7 };
const SPRING_WIDTH = { type: "spring" as const, stiffness: 400, damping: 30, mass: 0.8 };

const DEFAULT_PHASES = [
  "Thinking",
  "Searching the web",
  "Reading sources",
  "Writing response",
];

const SHIMMER_KEYFRAMES = `
@keyframes thinking-loader-shimmer {
  from { background-position: 200% center; }
  to   { background-position: -200% center; }
}
`;

export interface ThinkingLoaderProps {

  phases?: string[];

  interval?: number;

  loop?: boolean;

  done?: boolean;
  className?: string;
}

export const ThinkingLoader = React.forwardRef<HTMLDivElement, ThinkingLoaderProps>(
  function ThinkingLoader(
    { phases = DEFAULT_PHASES, interval = 2200, loop = true, done = false, className },
    ref,
  ) {
    const reduced = !!useReducedMotion();
    const [index, setIndex] = React.useState(0);

    const phasesKey = phases.join("␟");
    React.useEffect(() => {
      setIndex(0);
    }, [phasesKey]);

    React.useEffect(() => {
      if (done || phases.length <= 1) return;
      const id = window.setInterval(() => {
        setIndex((i) => {
          const next = i + 1;
          if (next >= phases.length) return loop ? 0 : i;
          return next;
        });
      }, interval);
      return () => window.clearInterval(id);
    }, [done, phases.length, interval, loop]);

    const label = done ? "Done" : (phases[index] ?? "");

    const shimmerStyle: React.CSSProperties =
      reduced || done
        ? {}
        : {
            backgroundImage:
              "linear-gradient(90deg, var(--tl-dim) 0%, var(--tl-bright) 50%, var(--tl-dim) 100%)",
            backgroundSize: "200% 100%",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
            animation: "thinking-loader-shimmer 2s linear infinite",
          };

    return (
      <motion.div
        ref={ref}
        layout
        transition={reduced ? { duration: 0 } : SPRING_WIDTH}
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex items-center gap-2 rounded-full",
          "border border-black/16 dark:border-white/14",
          "bg-black/[0.02] dark:bg-white/[0.03]",
          "px-4 h-9 text-sm font-medium",
          "[--tl-dim:rgba(0,0,0,0.4)] [--tl-bright:rgba(0,0,0,1)]",
          "dark:[--tl-dim:rgba(255,255,255,0.4)] dark:[--tl-bright:rgba(255,255,255,1)]",
          className,
        )}
      >
        {!reduced && !done && <style>{SHIMMER_KEYFRAMES}</style>}

        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.span
              key="check"
              layout="position"
              initial={{ scale: 0.86, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.86, opacity: 0, transition: { duration: 0.18, ease: ease.out } }}
              transition={reduced ? { duration: 0 } : SPRING_POP}
              className="text-green-500"
              aria-hidden
            >
              <Check size={15} strokeWidth={2.5} />
            </motion.span>
          ) : (
            <motion.span
              key="loader"
              layout="position"
              initial={{ scale: 0.86, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.86, opacity: 0, transition: { duration: 0.18, ease: ease.out } }}
              transition={reduced ? { duration: 0 } : SPRING_POP}
              className="text-zinc-900/60 dark:text-zinc-100/60"
              aria-hidden
            >
              <Loader
                size={15}
                strokeWidth={2}
                className={reduced ? undefined : "animate-spin"}
              />
            </motion.span>
          )}
        </AnimatePresence>

        <span className="grid">
          <AnimatePresence initial={false}>
            <motion.span
              key={label}
              initial={reduced ? { opacity: 0 } : { opacity: 0, maskPosition: "100% 0%" }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, maskPosition: "0% 0%" }}
              exit={{ opacity: 0, transition: { duration: 0.15, ease: ease.out } }}
              transition={reduced ? { duration: 0.2, ease: ease.out } : { duration: 0.45, ease: ease.out }}
              style={{
                ...shimmerStyle,
                ...(reduced
                  ? {}
                  : {
                      maskImage: "linear-gradient(90deg, #000 0%, #000 35%, transparent 65%)",
                      maskSize: "300% 100%",
                    }),
              }}
              className={cn("col-start-1 row-start-1 whitespace-nowrap", done && "text-green-500")}
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </span>
      </motion.div>
    );
  },
);
ThinkingLoader.displayName = "ThinkingLoader";
