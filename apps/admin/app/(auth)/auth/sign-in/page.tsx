import type { Metadata } from "next";
import { SignInForm } from "@staffly/ui";

export const metadata: Metadata = { title: "Sign in · Staffly Admin" };

export default function SignInPage(): React.ReactNode {
  return <SignInForm portal="admin" />;
}
