"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ResetPasswordForm } from "@staffly/ui";

function ResetPasswordInner(): React.ReactNode {
  const params = useSearchParams();
  return <ResetPasswordForm token={params?.get("token") ?? null} />;
}

export default function ResetPasswordPage(): React.ReactNode {
  // useSearchParams must be wrapped in Suspense for App Router static export.
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
