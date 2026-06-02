import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Accept invite · Staffly" };

export default function AcceptInvitePage(): React.ReactNode {
  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Welcome to Staffly
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set a password to activate your account.
        </p>
      </header>
      <div className="rounded-md border border-dashed bg-muted/40 px-4 py-6 text-center">
        <p className="text-sm font-medium">E-AUTH-005 placeholder</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Form wires to{" "}
          <code className="font-mono">POST /auth/invite/accept</code> (stubbed)
          in Sprint UI-1.2.
        </p>
      </div>
      <div className="text-center text-sm">
        <Link href="/auth/sign-in" className="hover:underline">
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}
