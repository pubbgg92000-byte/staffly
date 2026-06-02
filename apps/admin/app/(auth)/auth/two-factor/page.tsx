import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Two-factor · Staffly Admin",
};

export default function TwoFactorPage(): React.ReactNode {
  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Two-factor authentication
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the 6-digit code from your authenticator.
        </p>
      </header>
      <div className="rounded-md border border-dashed bg-muted/40 px-4 py-6 text-center">
        <p className="text-sm font-medium">A-AUTH-004 placeholder</p>
        <p className="mt-1 text-xs text-muted-foreground">
          OTP form wires to{" "}
          <code className="font-mono">POST /auth/two-factor/verify</code>{" "}
          (stubbed) in Sprint UI-1.2.
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
