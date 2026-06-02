"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ResetPasswordSchema, type ResetPasswordInput } from "@staffly/types";
import { useResetPassword } from "../api/session";
import { ApiError } from "../api/error";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { PasswordInput } from "../components/password-input";
import { PasswordStrengthMeter } from "../components/password-strength-meter";

export function ResetPasswordForm({
  token,
}: {
  /** The reset token, typically read from `?token=` in the URL. */
  token: string | null;
}): React.ReactNode {
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { token: token ?? "", password: "", confirm: "" },
  });
  const reset = useResetPassword();
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    try {
      await reset.mutateAsync(input);
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "reset.expired") {
          setServerError("This reset link has expired. Request a new one.");
        } else if (e.code === "reset.invalid") {
          setServerError("This reset link is invalid or already used.");
        } else {
          setServerError(e.message ?? "Reset failed");
        }
      } else {
        setServerError("Network error. Please try again.");
      }
    }
  });

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Missing reset token
        </h1>
        <p className="text-sm text-muted-foreground">
          Open the reset link from your email.
        </p>
        <Link
          href="/auth/forgot-password"
          className="inline-block text-sm hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Password updated
        </h1>
        <p className="text-sm text-muted-foreground">
          You can now sign in with your new password.
        </p>
        <Link
          href="/auth/sign-in"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  const password = form.watch("password");

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <header className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Choose a new password
        </h1>
        <p className="text-sm text-muted-foreground">
          Min 10 characters with a letter and a digit.
        </p>
      </header>

      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={!!form.formState.errors.password}
          {...form.register("password")}
        />
        <PasswordStrengthMeter value={password ?? ""} />
        {form.formState.errors.password ? (
          <p className="text-xs text-destructive">
            {form.formState.errors.password.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          aria-invalid={!!form.formState.errors.confirm}
          {...form.register("confirm")}
        />
        {form.formState.errors.confirm ? (
          <p className="text-xs text-destructive">
            {form.formState.errors.confirm.message}
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
        disabled={reset.isPending}
        aria-busy={reset.isPending}
      >
        {reset.isPending ? "Updating…" : "Update password"}
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
