import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";

/**
 * Identical algorithm to the announcements audience resolver. Lives in this
 * module so DocumentAudience rows (which Prisma types as a distinct shape)
 * can be passed in directly without cross-module type juggling.
 */
export interface DocumentAudienceRule {
  audienceType:
    | "all_employees"
    | "department"
    | "designation"
    | "location"
    | "employment_type"
    | "specific_employees";
  departmentId?: string | null;
  designationId?: string | null;
  locationId?: string | null;
  employmentType?:
    | "full_time"
    | "part_time"
    | "intern"
    | "contractor"
    | "consultant"
    | null;
  employeeId?: string | null;
}

@Injectable()
export class DocumentAudienceResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveEmployeeIds(
    organizationId: string,
    rules: DocumentAudienceRule[],
  ): Promise<string[]> {
    if (rules.length === 0) return [];
    const where = this.buildWhere(organizationId, rules);
    if (!where) return [];
    const employees = await this.prisma.db.employee.findMany({
      where,
      select: { id: true },
    });
    return employees.map((e) => e.id);
  }

  async countAudience(
    organizationId: string,
    rules: DocumentAudienceRule[],
  ): Promise<number> {
    if (rules.length === 0) return 0;
    const where = this.buildWhere(organizationId, rules);
    if (!where) return 0;
    return this.prisma.db.employee.count({ where });
  }

  private buildWhere(
    organizationId: string,
    rules: DocumentAudienceRule[],
  ): Prisma.EmployeeWhereInput | null {
    const base: Prisma.EmployeeWhereInput = {
      organizationId,
      deletedAt: null,
      status: { not: "offboarded" },
    };
    if (rules.some((r) => r.audienceType === "all_employees")) return base;

    const departmentIds: string[] = [];
    const designationIds: string[] = [];
    const locationIds: string[] = [];
    const employmentTypes: DocumentAudienceRule["employmentType"][] = [];
    const employeeIds: string[] = [];

    for (const r of rules) {
      switch (r.audienceType) {
        case "department":
          if (r.departmentId) departmentIds.push(r.departmentId);
          break;
        case "designation":
          if (r.designationId) designationIds.push(r.designationId);
          break;
        case "location":
          if (r.locationId) locationIds.push(r.locationId);
          break;
        case "employment_type":
          if (r.employmentType) employmentTypes.push(r.employmentType);
          break;
        case "specific_employees":
          if (r.employeeId) employeeIds.push(r.employeeId);
          break;
      }
    }

    const or: Prisma.EmployeeWhereInput[] = [];
    if (departmentIds.length) or.push({ departmentId: { in: departmentIds } });
    if (designationIds.length)
      or.push({ designationId: { in: designationIds } });
    if (locationIds.length) or.push({ locationId: { in: locationIds } });
    if (employmentTypes.length)
      or.push({
        employmentType: {
          in: employmentTypes as NonNullable<
            DocumentAudienceRule["employmentType"]
          >[],
        },
      });
    if (employeeIds.length) or.push({ id: { in: employeeIds } });
    if (or.length === 0) return null;
    return { ...base, OR: or };
  }
}
