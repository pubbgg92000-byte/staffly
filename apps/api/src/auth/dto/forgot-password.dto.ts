import { z } from "zod";

export const ForgotPasswordBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export type ForgotPasswordBodyT = z.infer<typeof ForgotPasswordBody>;
