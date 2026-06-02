import type { ReactNode } from "react";
import { AuthLayout } from "@staffly/ui";

export default function AuthGroupLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return <AuthLayout portalLabel="Admin">{children}</AuthLayout>;
}
