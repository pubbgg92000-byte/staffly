import { z } from "zod";

export const VerifyTwoFactorBody = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  rememberMe: z.boolean().optional(),
});

export type VerifyTwoFactorBodyT = z.infer<typeof VerifyTwoFactorBody>;
