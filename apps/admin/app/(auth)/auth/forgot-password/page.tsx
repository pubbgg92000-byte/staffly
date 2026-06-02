import type { Metadata } from "next";
import { ForgotPasswordForm } from "@staffly/ui";

export const metadata: Metadata = {
  title: "Forgot password · Staffly Admin",
};

export default function ForgotPasswordPage(): React.ReactNode {
  return <ForgotPasswordForm />;
}
