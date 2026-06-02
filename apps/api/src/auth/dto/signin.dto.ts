import { z } from "zod";

export const SigninBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
  /**
   * Optional "remember me" flag — when true, the issued refresh cookie uses
   * the long-lived TTL (REMEMBER_ME_REFRESH_TTL_SECONDS). When false or
   * absent, the default REFRESH_TOKEN_TTL_SECONDS applies.
   */
  rememberMe: z.boolean().optional(),
});

export type SigninBodyT = z.infer<typeof SigninBody>;
