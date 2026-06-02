"use client";

import { Suspense } from "react";
import { TwoFactorForm } from "@staffly/ui";

export default function TwoFactorPage(): React.ReactNode {
  return (
    <Suspense fallback={null}>
      <TwoFactorForm portal="admin" />
    </Suspense>
  );
}
