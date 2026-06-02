import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Reset password · Staffly" };

export default function ResetPasswordPage(): React.ReactNode {
  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a strong, new password.
        </p>
      </header>
      <div className="rounded-md border border-dashed bg-muted/40 px-4 py-6 text-center">
        <p className="text-sm font-medium">E-AUTH-003 placeholder</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Form wires to{" "}
          <code className="font-mono">POST /auth/reset-password</code> (stubbed)
          in Sprint UI-1.2.
        </p>
      </div>
      <div className="text-center text-sm">
        <Link href="/auth/sign-in" className="hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
