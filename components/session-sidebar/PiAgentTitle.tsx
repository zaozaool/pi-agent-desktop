"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useI18n } from "../I18nProvider";

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

function useScramble(target: string, running: boolean): string {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef<number | null>(null);
  const iterRef = useRef(0);

  useEffect(() => {
    if (!running) {
      setDisplay(target);
      return;
    }
    iterRef.current = 0;
    const totalFrames = target.length * 4;

    const step = () => {
      iterRef.current += 1;
      const progress = iterRef.current / totalFrames;
      const resolved = Math.floor(progress * target.length);

      setDisplay(
        target
          .split("")
          .map((char, i) => {
            if (char === " ") return " ";
            if (i < resolved) return char;
            return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          })
          .join("")
      );

      if (iterRef.current < totalFrames) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(target);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, running]);

  return display;
}

export function PiAgentTitle() {
  const [showVersion, setShowVersion] = useState(true);
  const [scrambling, setScrambling] = useState(false);
  const { t } = useI18n();
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const target = showVersion ? `v${process.env.NEXT_PUBLIC_PI_VERSION ?? "0.0.0"}` : "";
  // const target = showVersion ? `${process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"}p${process.env.NEXT_PUBLIC_PI_VERSION ?? "0.0.0"}` : "Pi Agent Desktop";
  const display = useScramble(target, scrambling);

  const triggerScramble = useCallback((toVersion: boolean) => {
    setShowVersion(toVersion);
    setScrambling(true);
    setTimeout(() => setScrambling(false), (toVersion ? 6 : 8) * 4 * (1000 / 60) + 100);
  }, []);

  const handleClick = useCallback(() => {
    if (revertTimerRef.current) clearTimeout(revertTimerRef.current);

    const next = !showVersion;
    triggerScramble(next);

    if (next) {
      revertTimerRef.current = setTimeout(() => triggerScramble(false), 3000);
    }
  }, [showVersion, triggerScramble]);

  useEffect(() => () => { if (revertTimerRef.current) clearTimeout(revertTimerRef.current); }, []);

  return (
    <button
      onClick={handleClick}
      title={t("sidebar.appTitle")}
      className="pi-agent-title flex items-center gap-2 bg-transparent border-none p-0 cursor-pointer group"
    >
      {/* Logo mark - currentColor so it follows the theme text color */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 800 800"
        aria-label="Pi Agent Desktop"
        className="shrink-0 transition-colors duration-150 text-text-strong group-hover:text-accent"
      >
        <path fill="currentColor" fillRule="evenodd" d="M165.29 165.29 H517.36 V400 H400 V517.36 H282.65 V634.72 H165.29 Z M282.65 282.65 V400 H400 V282.65 Z" />
        <path fill="currentColor" d="M517.36 400 H634.72 V634.72 H517.36 Z" />
      </svg>
      {showVersion && (
        <span className="font-bold text-[13px] tracking-normal font-mono text-accent min-w-[6ch] text-left">
          {display}
        </span>
      )}
    </button>
  );
}
