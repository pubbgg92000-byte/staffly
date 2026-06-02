import { z } from "zod";

export const PeekInviteQuery = z.object({
  token: z.string().min(1).max(200),
});
export type PeekInviteQueryT = z.infer<typeof PeekInviteQuery>;

export const AcceptInviteBody = z.object({
  token: z.string().min(1).max(200),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  password: z
    .string()
    .min(10, "Minimum 10 characters")
    .max(200)
    .regex(/[A-Za-z]/, "Must include a letter")
    .regex(/\d/, "Must include a digit"),
});
export type AcceptInviteBodyT = z.infer<typeof AcceptInviteBody>;
