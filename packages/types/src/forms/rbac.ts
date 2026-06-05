import { z } from "zod";

const emptyToUndef = (v: string | undefined) => (v === "" ? undefined : v);

export const RoleSchema = z.object({
  name: z.string().trim().min(1, "Required").max(80),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  permissions: z.array(z.string()).default([]),
});

export type RoleFormValues = z.infer<typeof RoleSchema>;

/**
 * Invite form — `super_admin` is intentionally excluded; the backend rejects
 * any attempt to issue a super_admin invite (it can only be created at
 * org-bootstrap).
 */
export const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  roleKey: z.enum(["hr_admin", "manager", "employee"], {
    errorMap: () => ({ message: "Pick a role" }),
  }),
});

export type InviteFormValues = z.infer<typeof InviteSchema>;
