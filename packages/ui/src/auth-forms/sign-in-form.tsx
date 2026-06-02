"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  SignInSchema,
  isTwoFactorChallenge,
  type DefaultPortal,
  type SignInInput,
} from "@staffly/types";
import { useSignIn } from "../api/session";
import { ApiError } from "../api/error";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PasswordInput } from "../components/password-input";
import { toast } from "../providers/toast-provider";
import { resolveRedirect } from "./role-redirect";

const FRIENDLY_ERRORS: Record<string, string> = {
  "auth.unauthenticated":
    "We couldn't sign you in. Check your email or password.",
  "account.locked":
    "Your account is temporarily locked. Try again in 15 minutes.",
};

export function SignInForm({
  portal,
  twoFactorHref,
}: {
  /** Which portal this form lives in. Drives the role-based redirect. */
  portal: DefaultPortal;
  /**
   * Path to the 2FA verify screen on this portal. Defaults to
   * `/auth/two-factor`. The form appends `?challenge=<id>` so the next
   * screen knows which challenge to verify.
   */
  twoFactorHref?: string;
}): React.ReactNode {
  const form = useForm<SignInInput>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
  });
  const signIn = useSignIn();
  const [serverError, setServerError] = useState<string | null>(null);
  const fromParam =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("from")
      : null;

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    try {
      const res = await signIn.mutateAsync(input);
      if (isTwoFactorChallenge(res)) {
        const href = `${twoFactorHref ?? "/auth/two-factor"}?challenge=${
          res.challenge.id
        }${input.rememberMe ? "&remember=1" : ""}`;
        window.location.assign(href);
        return;
      }
      toast.success(`Welcome back, ${res.user.email}`);
      const target = resolveRedirect({
        current: portal,
        defaultPortal: res.defaultPortal,
        from: fromParam,
      });
      window.location.assign(target);
    } catch (e) {
      if (e instanceof ApiError) {
        setServerError(
          FRIENDLY_ERRORS[e.code] ?? e.message ?? "Sign-in failed",
        );
      } else {
        setServerError("Network error. Please try again.");
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <header className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Use your work email and password.
        </p>
      </header>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          autoFocus
          aria-invalid={!!form.formState.errors.email}
          {...form.register("email")}
        />
        {form.formState.errors.email ? (
          <p className="text-xs text-destructive">
            {form.formState.errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/auth/forgot-password"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Forgot?
          </Link>
        </div>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          aria-invalid={!!form.formState.errors.password}
          {...form.register("password")}
        />
        {form.formState.errors.password ? (
          <p className="text-xs text-destructive">
            {form.formState.errors.password.message}
          </p>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring"
          {...form.register("rememberMe")}
        />
        Remember me on this device
      </label>

      {serverError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      ) : null}

      <Button
        type="submit"
        className="w-full"
        disabled={signIn.isPending}
        aria-busy={signIn.isPending}
      >
        {signIn.isPending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Have an invite?{" "}
        <Link href="/auth/accept-invite" className="hover:underline">
          Accept it here
        </Link>
        .
      </p>
    </form>
  );
}
