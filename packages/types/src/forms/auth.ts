/**
 * Auth form schemas. Shared between the UI (react-hook-form via
 * @hookform/resolvers/zod) and the API DTOs once the matching endpoints
 * exist. Rules mirror docs/04-design-system.md §15.2.
 *
 * Keep this module side-effect-free and dependency-light so server runtimes
 * (NestJS) can import it without pulling in client-only code.
 */
import { z } from "zod";

const Email = z.string().trim().toLowerCase().email().max(254);

// Match the backend's signup rule (apps/api/src/auth/dto/signup.dto.ts uses
// min(16)). We require min 10 for forms the backend doesn't yet validate.
const StrongPassword = z
  .string()
  .min(10, "Minimum 10 characters")
  .regex(/[A-Za-z]/, "Must include a letter")
  .regex(/\d/, "Must include a digit");

export const SignInSchema = z.object({
  email: Email,
  password: z.string().min(1, "Required"),
});
export type SignInInput = z.infer<typeof SignInSchema>;

export const ForgotPasswordSchema = z.object({
  email: Email,
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: StrongPassword,
    confirm: z.string().min(1, "Required"),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export const TwoFactorSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
export type TwoFactorInput = z.infer<typeof TwoFactorSchema>;

export const AcceptInviteSchema = z.object({
  token: z.string().min(1),
  firstName: z.string().trim().min(1, "Required").max(60),
  lastName: z.string().trim().min(1, "Required").max(60),
  password: StrongPassword,
});
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;
