export interface DefaultDocumentCategorySeed {
  name: string;
  code: string;
  color: string;
  isPersonal: boolean;
}

/**
 * Default document categories materialized into every new organization at
 * signup time via OrgBootstrapService. Marked isSystem=true so they cannot
 * be deleted via the API. Admins may rename them or add their own.
 */
export const DEFAULT_DOCUMENT_CATEGORIES: readonly DefaultDocumentCategorySeed[] =
  Object.freeze([
    {
      name: "Company Policy",
      code: "POLICY",
      color: "#6366F1",
      isPersonal: false,
    },
    {
      name: "Compliance",
      code: "COMPLIANCE",
      color: "#F59E0B",
      isPersonal: false,
    },
    {
      name: "Onboarding",
      code: "ONBOARDING",
      color: "#10B981",
      isPersonal: false,
    },
    {
      name: "Contract",
      code: "CONTRACT",
      color: "#3B82F6",
      isPersonal: true,
    },
    {
      name: "Payslip",
      code: "PAYSLIP",
      color: "#8B5CF6",
      isPersonal: true,
    },
  ]);
