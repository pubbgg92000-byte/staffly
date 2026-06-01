import { z } from "zod";

export const SignupBody = z.object({
  organizationName: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(60)
    .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, {
      message:
        "slug must be lowercase, start with a letter, and contain only letters, digits, or dashes",
    }),
  fullName: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(200),
});

export type SignupBodyT = z.infer<typeof SignupBody>;
