"use client";

import { cn } from "../lib/cn";

/**
 * Cheap, dependency-free strength indicator. Scoring rules:
 *
 *   0 — empty
 *   1 — < 8 chars OR no letters
 *   2 — ≥ 8 chars with letters
 *   3 — ≥ 10 chars with letters + digits OR symbol
 *   4 — ≥ 12 chars with letters + digits + symbol
 *
 * We deliberately avoid zxcvbn (650 KB minified) for now; the form Zod schema
 * is the source of truth on what's *acceptable*. This meter just nudges users
 * toward stronger passwords visually. Replace with zxcvbn later if needed.
 */
function scorePassword(value: string): 0 | 1 | 2 | 3 | 4 {
  if (!value) return 0;
  const len = value.length;
  const hasLetter = /[A-Za-z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);
  if (len < 8 || !hasLetter) return 1;
  if (len < 10) return 2;
  if (len >= 12 && hasDigit && hasSymbol) return 4;
  if (hasDigit || hasSymbol) return 3;
  return 2;
}

const labels: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "",
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Strong",
};

const tones: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-muted",
  1: "bg-destructive",
  2: "bg-warning",
  3: "bg-info",
  4: "bg-success",
};

export function PasswordStrengthMeter({
  value,
  className,
}: {
  value: string;
  className?: string;
}): React.ReactNode {
  const score = scorePassword(value);
  return (
    <div className={cn("space-y-1", className)} aria-live="polite">
      <div className="flex h-1.5 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-full",
              i <= score ? tones[score] : "bg-muted",
            )}
          />
        ))}
      </div>
      {score > 0 ? (
        <p className="text-xs text-muted-foreground">{labels[score]}</p>
      ) : null}
    </div>
  );
}
