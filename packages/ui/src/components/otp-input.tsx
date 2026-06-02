"use client";

import * as React from "react";
import { cn } from "../lib/cn";

/**
 * 6-digit numeric one-time-code input. Behaviors required by
 * docs/05 A-AUTH-004 / docs/06 E-AUTH-004:
 *
 * - Auto-advance focus to the next box on input.
 * - Backspace clears + retreats.
 * - Paste a 6-digit string anywhere → fills all boxes and fires onChange.
 * - Emits a string (length 0–6) via `onChange`; never an array.
 *
 * Uncontrolled-style API: the parent owns the value as a string.
 */
export interface OtpInputProps {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus = true,
  disabled,
  ariaLabel = "One-time code",
  className,
}: OtpInputProps): React.ReactNode {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);

  const chars = React.useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < length; i += 1) out.push(value[i] ?? "");
    return out;
  }, [value, length]);

  const updateAt = (i: number, ch: string): void => {
    const next = (value.slice(0, i) + ch + value.slice(i + 1)).slice(0, length);
    onChange(next);
  };

  const handleInput = (
    i: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const raw = e.target.value;
    // Only the most-recent digit counts (handles overwriting an existing box).
    const ch = raw.replace(/\D/g, "").slice(-1);
    if (!ch) {
      updateAt(i, "");
      return;
    }
    updateAt(i, ch);
    const nextEl = refs.current[i + 1];
    if (nextEl) nextEl.focus();
  };

  const handleKeyDown = (
    i: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ): void => {
    if (e.key === "Backspace" && !chars[i] && i > 0) {
      const prev = refs.current[i - 1];
      if (prev) prev.focus();
    }
    if (e.key === "ArrowLeft" && i > 0) {
      const prev = refs.current[i - 1];
      if (prev) prev.focus();
    }
    if (e.key === "ArrowRight" && i < length - 1) {
      const next = refs.current[i + 1];
      if (next) next.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>): void => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!text) return;
    e.preventDefault();
    const next = text.slice(0, length);
    onChange(next);
    const focusIndex = Math.min(next.length, length - 1);
    const el = refs.current[focusIndex];
    if (el) el.focus();
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex gap-2", className)}
    >
      {chars.map((ch, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={ch}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleInput(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          aria-label={`Digit ${i + 1}`}
          className="h-12 w-10 rounded-md border border-input bg-background text-center text-lg font-semibold tabular-nums ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 sm:w-12"
        />
      ))}
    </div>
  );
}
