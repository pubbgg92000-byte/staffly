import { z } from "zod";

export const SigninBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

export type SigninBodyT = z.infer<typeof SigninBody>;
