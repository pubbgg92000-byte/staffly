"use client";

import { Toaster as SonnerToaster } from "sonner";
import type { ReactNode } from "react";

/**
 * Single top-of-page Sonner Toaster. Rendered from RootLayout so every
 * client component can call `toast.success(...)` / `toast.error(...)`.
 */
export function Toaster(): ReactNode {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "border border-border bg-card text-card-foreground",
        },
      }}
    />
  );
}

export { toast } from "sonner";
