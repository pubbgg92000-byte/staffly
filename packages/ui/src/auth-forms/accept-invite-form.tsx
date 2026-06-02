"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AcceptInviteSchema,
  type AcceptInviteInput,
  type DefaultPortal,
} from "@staffly/types";
import { useAcceptInvite, useInvitePeek } from "../api/session";
import { ApiError } from "../api/error";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PasswordInput } from "../components/password-input";
import { PasswordStrengthMeter } from "../components/password-strength-meter";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "../providers/toast-provider";
import { resolveRedirect } from "./role-redirect";

export function AcceptInviteForm({
  portal,
}: {
  portal: DefaultPortal;
}): React.ReactNode {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  const peek = useInvitePeek(token);
  const accept = useAcceptInvite();

  const form = useForm<AcceptInviteInput>({
    resolver: zodResolver(AcceptInviteSchema),
    defaultValues: { token: "", firstName: "", lastName: "", password: "" },
  });
  useEffect(() => {
    if (token) form.setValue("token", token);
  }, [token, form]);

  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = form.handleSubmit(async (input) => {
    setServerError(null);
    try {
      const res = await accept.mutateAsync(input);
      toast.success(`Welcome, ${res.user.email}`);
      const target = resolveRedirect({
        current: portal,
        defaultPortal: res.defaultPortal,
      });
      window.location.assign(target);
    } catch (e) {
      if (e instanceof ApiError) {
        const friendly: Record<string, string> = {
          "invite.invalid": "This invite link is invalid.",
          "invite.expired":
            "This invite has expired. Ask your admin for a new one.",
          "invite.revoked": "This invite has been revoked.",
          "invite.already_accepted":
            "This invite has already been accepted. Sign in instead.",
        };
        setServerError(
          friendly[e.code] ?? e.message ?? "Could not accept invite",
        );
      } else {
        setServerError("Network error. Please try again.");
      }
    }
  });

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Missing invite token
        </h1>
        <p className="text-sm text-muted-foreground">
          Open the invite link from your email.
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

  if (peek.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (peek.error) {
    const code = peek.error.code;
    const msg =
      code === "invite.invalid"
        ? "This invite link is invalid."
        : code === "invite.expired"
          ? "This invite has expired."
          : code === "invite.revoked"
            ? "This invite has been revoked."
            : code === "invite.already_accepted"
              ? "This invite has already been accepted."
              : (peek.error.message ?? "Could not load invite");
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Invite problem</h1>
        <p className="text-sm text-muted-foreground">{msg}</p>
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
          Welcome to {peek.data?.organization.name ?? "Staffly"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {peek.data ? (
            <>
              Set a password for{" "}
              <span className="font-medium text-foreground">
                {peek.data.email}
              </span>{" "}
              to activate your account.
            </>
          ) : (
            "Loading…"
          )}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            autoComplete="given-name"
            aria-invalid={!!form.formState.errors.firstName}
            {...form.register("firstName")}
          />
          {form.formState.errors.firstName ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.firstName.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            autoComplete="family-name"
            aria-invalid={!!form.formState.errors.lastName}
            {...form.register("lastName")}
          />
          {form.formState.errors.lastName ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.lastName.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={!!form.formState.errors.password}
          {...form.register("password")}
        />
        <PasswordStrengthMeter value={form.watch("password") ?? ""} />
        {form.formState.errors.password ? (
          <p className="text-xs text-destructive">
            {form.formState.errors.password.message}
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
        disabled={accept.isPending}
        aria-busy={accept.isPending}
      >
        {accept.isPending ? "Activating…" : "Activate account"}
      </Button>
    </form>
  );
}
