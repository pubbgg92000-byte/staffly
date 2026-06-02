import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Sign in · Staffly" };

export default function SignInPage(): React.ReactNode {
  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back. Use your work email and password.
        </p>
      </header>
      <div className="rounded-md border border-dashed bg-muted/40 px-4 py-6 text-center">
        <p className="text-sm font-medium">E-AUTH-001 placeholder</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sign-in form wires to{" "}
          <code className="font-mono">POST /auth/signin</code> in Sprint UI-1.2.
        </p>
      </div>
      <div className="flex items-center justify-between text-sm">
        <Link
          href="/auth/forgot-password"
          className="text-muted-foreground hover:text-foreground"
        >
          Forgot password?
        </Link>
        <Link
          href="/auth/accept-invite"
          className="text-muted-foreground hover:text-foreground"
        >
          Have an invite?
        </Link>
      </div>
    </div>
  );
}
