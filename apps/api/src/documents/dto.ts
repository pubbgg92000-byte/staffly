import { z } from "zod";

const EmploymentType = z.enum([
  "full_time",
  "part_time",
  "intern",
  "contractor",
  "consultant",
]);

const AudienceTypeEnum = z.enum([
  "all_employees",
  "department",
  "designation",
  "location",
  "employment_type",
  "specific_employees",
]);

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
    const need = (
      key: keyof typeof v,
      expected: boolean,
      label: string,
    ): void => {
      if (expected && !v[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [label],
          message: `${label} required for type=${v.type}`,
        });
      }
      if (!expected && v[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [label],
          message: `${label} not allowed for type=${v.type}`,
        });
      }
    };
    need("departmentId", v.type === "department", "departmentId");
    need("designationId", v.type === "designation", "designationId");
    need("locationId", v.type === "location", "locationId");
    need("employmentType", v.type === "employment_type", "employmentType");
    need("employeeId", v.type === "specific_employees", "employeeId");
  });
export type AudienceItemT = z.infer<typeof AudienceItem>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const isoDateTime = z
  .string()
  .datetime({ message: "expected ISO 8601 timestamp" });

// ─── Categories ───────────────────────────────────────────────────────

const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);

export const CreateCategoryBody = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().toUpperCase().min(1).max(20).optional(),
  color: HexColor.optional(),
  description: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional(),
  isPersonal: z.boolean().optional(),
});
export const UpdateCategoryBody = CreateCategoryBody.partial();
export type CreateCategoryBodyT = z.infer<typeof CreateCategoryBody>;
export type UpdateCategoryBodyT = z.infer<typeof UpdateCategoryBody>;

export const CategoryListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  isActive: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
  isPersonal: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
});
export type CategoryListQueryT = z.infer<typeof CategoryListQuery>;

// ─── File metadata (post-presign confirmation) ────────────────────────

export const FileMeta = z.object({
  storageKey: z.string().min(1).max(512),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(100 * 1024 * 1024), // 100 MB cap
});
export type FileMetaT = z.infer<typeof FileMeta>;

// ─── Presign upload ────────────────────────────────────────────────────

export const PresignUploadBody = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(100 * 1024 * 1024),
});
export type PresignUploadBodyT = z.infer<typeof PresignUploadBody>;

// ─── Documents ────────────────────────────────────────────────────────

export const CreateDocumentBody = z
  .object({
    categoryId: z.string().uuid(),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().max(4000).optional(),
    file: FileMeta,
    isRequired: z.boolean().optional(),
    dueBy: isoDate.optional(),
    isPersonal: z.boolean().optional(),
    subjectEmployeeId: z.string().uuid().optional(),
    expiresAt: isoDateTime.optional(),
    audiences: z.array(AudienceItem).optional(),
    publishNow: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.isPersonal && !v.subjectEmployeeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subjectEmployeeId"],
        message: "required when isPersonal=true",
      });
    }
    if (!v.isPersonal && v.subjectEmployeeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subjectEmployeeId"],
        message: "only valid when isPersonal=true",
      });
    }
    if (!v.isPersonal && (!v.audiences || v.audiences.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audiences"],
        message: "at least one audience required for distributed documents",
      });
    }
  });
export type CreateDocumentBodyT = z.infer<typeof CreateDocumentBody>;

export const UpdateDocumentBody = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  isRequired: z.boolean().optional(),
  dueBy: isoDate.nullable().optional(),
  expiresAt: isoDateTime.nullable().optional(),
  audiences: z.array(AudienceItem).min(1).optional(),
});
export type UpdateDocumentBodyT = z.infer<typeof UpdateDocumentBody>;

export const ReplaceFileBody = z.object({
  file: FileMeta,
});
export type ReplaceFileBodyT = z.infer<typeof ReplaceFileBody>;

export const DocumentListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.string().uuid().optional(),
  isRequired: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
  isPersonal: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
  subjectEmployeeId: z.string().uuid().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  expiringInDays: z.coerce.number().int().min(1).max(365).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  sortBy: z
    .enum(["createdAt", "publishedAt", "expiresAt", "title"])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type DocumentListQueryT = z.infer<typeof DocumentListQuery>;

export const MyDocumentsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unacknowledgedOnly: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
});
export type MyDocumentsQueryT = z.infer<typeof MyDocumentsQuery>;

export const AcknowledgementsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});
export type AcknowledgementsQueryT = z.infer<typeof AcknowledgementsQuery>;

export const AudiencePreviewBody = z.object({
  audiences: z.array(AudienceItem).min(1),
});
export type AudiencePreviewBodyT = z.infer<typeof AudiencePreviewBody>;
