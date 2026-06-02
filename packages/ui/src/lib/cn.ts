import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Standard tailwind class merger used by every component in the package.
 * Variants are produced by `class-variance-authority`; consumers occasionally
 * pass through extra utilities. `cn()` resolves conflicts deterministically.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
