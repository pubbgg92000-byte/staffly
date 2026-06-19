import { redirect } from "next/navigation";

/**
 * Root → /dashboard. The authenticated app layout verifies the API-backed
 * session and redirects signed-out users to /auth/sign-in.
 */
export default function Index(): never {
  redirect("/dashboard");
}
