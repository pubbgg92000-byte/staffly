import { z } from "zod";

const EmploymentType = z.enum([
  "full_time",
  "part_time",
  "intern",
  "contractor",
  "consultant",
]);

const AnnouncementPriority = z.enum(["low", "normal", "high"]);
const AnnouncementStatus = z.enum([
  "draft",
  "scheduled",
  "published",
  "archived",
]);

const AudienceTypeEnum = z.enum([
  "all_employees",
  "department",
  "designation",
  "location",
  "employment_type",
  "specific_employees",
]);

// ─── Audience selector ────────────────────────────────────────────────
//
// Per docs/02 §2.7.2, audiences mirror document_audiences. We model each
// audience entry as a discriminated record: the "type" field tells which
// other column carries the FK / enum value. The DB columns are nullable;
// validation guarantees the right column is present per type.

export const AudienceItem = z
  .object({
    type: AudienceTypeEnum,
    departmentId: z.string().uuid().optional(),
    designationId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    employmentType: EmploymentType.optional(),
    employeeId: z.string().uuid().optional(),
  })
  .superRefine((v, ctx) => {
    const must = (field: keyof typeof v, present: boolean): void => {
      if (present && !v[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} required for type=${v.type}`,
        });
      }
      if (!present && v[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} not allowed for type=${v.type}`,
        });
      }
    };
    must("departmentId", v.type === "department");
    must("designationId", v.type === "designation");
    must("locationId", v.type === "location");
    must("employmentType", v.type === "employment_type");
    must("employeeId", v.type === "specific_employees");
  });
export type AudienceItemT = z.infer<typeof AudienceItem>;

const isoDateTime = z
  .string()
  .datetime({ message: "expected ISO 8601 timestamp" });

// ─── Create / update ──────────────────────────────────────────────────

export const CreateAnnouncementBody = z.object({
  title: z.string().trim().min(1).max(180),
  bodyHtml: z.string().min(1),
  coverImageUrl: z.string().url().max(2048).optional(),
  pinned: z.boolean().optional(),
  requiresAcknowledgment: z.boolean().optional(),
  priority: AnnouncementPriority.optional(),
  scheduledFor: isoDateTime.optional(),
  expiresAt: isoDateTime.optional(),
  audiences: z.array(AudienceItem).min(1),
});
export type CreateAnnouncementBodyT = z.infer<typeof CreateAnnouncementBody>;

export const UpdateAnnouncementBody = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  bodyHtml: z.string().min(1).optional(),
  coverImageUrl: z.string().url().max(2048).nullable().optional(),
  pinned: z.boolean().optional(),
  requiresAcknowledgment: z.boolean().optional(),
  priority: AnnouncementPriority.optional(),
  scheduledFor: isoDateTime.nullable().optional(),
  expiresAt: isoDateTime.nullable().optional(),
  audiences: z.array(AudienceItem).min(1).optional(),
});
export type UpdateAnnouncementBodyT = z.infer<typeof UpdateAnnouncementBody>;

// ─── Publish ──────────────────────────────────────────────────────────

export const PublishAnnouncementBody = z
  .object({
    scheduledFor: isoDateTime.optional(),
  })
  .optional();
export type PublishAnnouncementBodyT = z.infer<typeof PublishAnnouncementBody>;

// ─── Audience preview ─────────────────────────────────────────────────

export const AudiencePreviewBody = z.object({
  audiences: z.array(AudienceItem).min(1),
});
export type AudiencePreviewBodyT = z.infer<typeof AudiencePreviewBody>;

// ─── List queries ─────────────────────────────────────────────────────

export const AnnouncementListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: AnnouncementStatus.optional(),
  search: z.string().trim().min(1).max(120).optional(),
  pinnedFirst: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
  sortBy: z
    .enum(["createdAt", "publishedAt", "scheduledFor", "title"])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type AnnouncementListQueryT = z.infer<typeof AnnouncementListQuery>;

export const MyAnnouncementsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unacknowledgedOnly: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
});
export type MyAnnouncementsQueryT = z.infer<typeof MyAnnouncementsQuery>;

export const AcknowledgementsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});
export type AcknowledgementsQueryT = z.infer<typeof AcknowledgementsQuery>;
