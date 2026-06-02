"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  TwoFactorSchema,
  type DefaultPortal,
  type TwoFactorInput,
} from "@staffly/types";
import { useVerifyTwoFactor } from "../api/session";
import { ApiError } from "../api/error";
import { Button } from "../components/ui/button";
import { OtpInput } from "../components/otp-input";
import { toast } from "../providers/toast-provider";
import { resolveRedirect } from "./role-redirect";

export function TwoFactorForm({
  portal,
}: {
  portal: DefaultPortal;
}): React.ReactNode {
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setChallengeId(params.get("challenge"));
    setRemember(params.get("remember") === "1");
  }, []);

  const form = useForm<TwoFactorInput>({
    resolver: zodResolver(TwoFactorSchema),
    defaultValues: { challengeId: "", code: "", rememberMe: false },
  });
  // Keep RHF in sync with the URL-derived values.
  useEffect(() => {
    if (challengeId) form.setValue("challengeId", challengeId);
    form.setValue("rememberMe", remember);
  }, [challengeId, remember, form]);

  const verify = useVerifyTwoFactor();
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    try {
      const res = await verify.mutateAsync(input);
      toast.success("Signed in");
      const target = resolveRedirect({
        current: portal,
        defaultPortal: res.defaultPortal,
      });
      window.location.assign(target);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "two_factor.invalid") {
          setServerError("That code is incorrect. Try again.");
        } else if (e.code === "two_factor.expired") {
          setServerError("This challenge has expired. Sign in again.");
        } else if (e.code === "two_factor.too_many_attempts") {
          setServerError("Too many attempts. Return to sign-in and try again.");
        } else {
          setServerError(e.message ?? "Verification failed");
        }
      } else {
        setServerError("Network error. Please try again.");
      }
    }
  });

  if (!challengeId) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          No active 2FA challenge
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in again to receive a new challenge.
        </p>
        <Link
          href="/auth/sign-in"
          className="inline-block text-sm hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <header className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Two-factor authentication
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code from your authenticator app.
        </p>
        <p className="text-xs text-muted-foreground">
          Dev mode — your code is printed in the API server logs.
        </p>
      </header>

      <div className="flex justify-center">
        <OtpInput
          value={form.watch("code") ?? ""}
          onChange={(v) => form.setValue("code", v, { shouldValidate: true })}
          ariaLabel="One-time code"
        />
      </div>
      {form.formState.errors.code ? (
        <p className="text-center text-xs text-destructive">
          {form.formState.errors.code.message}
        </p>
      ) : null}

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
        disabled={verify.isPending}
        aria-busy={verify.isPending}
      >
        {verify.isPending ? "Verifying…" : "Verify"}
      </Button>

      <p className="text-center text-xs">
        <Link
          href="/auth/sign-in"
          className="text-muted-foreground hover:text-foreground"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
