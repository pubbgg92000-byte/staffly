"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ForgotPasswordSchema, type ForgotPasswordInput } from "@staffly/types";
import { useForgotPassword } from "../api/session";
import { ApiError } from "../api/error";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export function ForgotPasswordForm(): React.ReactNode {
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const fp = useForgotPassword();
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    try {
      const res = await fp.mutateAsync(input);
      setDone(true);
      if (res.devResetUrl) setDevUrl(res.devResetUrl);
    } catch (e) {
      setServerError(
        e instanceof ApiError
          ? (e.message ?? "Could not send reset link")
          : "Network error. Please try again.",
      );
    }
  });

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <header className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground">
            If an account exists for that address, we&apos;ve sent a reset link.
            It expires in 60 minutes.
          </p>
        </header>
        {devUrl ? (
          <div className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-left text-xs">
            <p className="mb-1 font-medium text-info">Dev mode — reset URL</p>
            <a
              href={devUrl}
              className="break-all font-mono text-info hover:underline"
            >
              {devUrl}
            </a>
          </div>
        ) : null}
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
          Forgot password?
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link.
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
        disabled={fp.isPending}
        aria-busy={fp.isPending}
      >
        {fp.isPending ? "Sending…" : "Send reset link"}
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
