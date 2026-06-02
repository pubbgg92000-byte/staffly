import { z } from "zod";

export const ResetPasswordBody = z.object({
  token: z.string().min(1).max(200),
  password: z
    .string()
    .min(10, "Minimum 10 characters")
    .max(200)
    .regex(/[A-Za-z]/, "Must include a letter")
    .regex(/\d/, "Must include a digit"),
});

export type ResetPasswordBodyT = z.infer<typeof ResetPasswordBody>;
