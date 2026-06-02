import { redirect } from "next/navigation";

/**
 * Root → /dashboard. Middleware handles the unauthenticated case by
 * redirecting unauthenticated users back to /auth/sign-in before this
 * component runs.
 */
export default function Index(): never {
  redirect("/dashboard");
}
