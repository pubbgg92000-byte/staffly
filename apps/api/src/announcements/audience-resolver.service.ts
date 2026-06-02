import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";

/**
 * Audience descriptor for the resolver. Mirrors `announcement_audiences` rows
 * but accepts the in-memory shape used by both the create/update DTOs and
 * the persisted Prisma rows (after a `pick()`).
 */
export interface AudienceRule {
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
export class AudienceResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the deduplicated set of *active, non-deleted* employee IDs covered
   * by the union of `rules`. Soft-deleted and `offboarded` employees are
   * excluded — they neither receive notifications nor count toward ack totals.
   *
   * Returns an empty set when no rules match.
   */
  async resolveEmployeeIds(
    organizationId: string,
    rules: AudienceRule[],
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

  /** Same shape as `resolveEmployeeIds` but returns the count only. */
  async countAudience(
    organizationId: string,
    rules: AudienceRule[],
  ): Promise<number> {
    if (rules.length === 0) return 0;
    const where = this.buildWhere(organizationId, rules);
    if (!where) return 0;
    return this.prisma.db.employee.count({ where });
  }

  /**
   * Build a single `WHERE` that is the OR of all rules. We collect bucketed
   * conditions per rule type so a single rule per type becomes equality, and
   * multiple rules become `IN (...)`. `all_employees` short-circuits to "no
   * extra predicate" (still scoped to the org + active employees).
   */
  private buildWhere(
    organizationId: string,
    rules: AudienceRule[],
  ): Prisma.EmployeeWhereInput | null {
    const base: Prisma.EmployeeWhereInput = {
      organizationId,
      deletedAt: null,
      status: { not: "offboarded" },
    };

    if (rules.some((r) => r.audienceType === "all_employees")) {
      return base;
    }

    const departmentIds: string[] = [];
    const designationIds: string[] = [];
    const locationIds: string[] = [];
    const employmentTypes: AudienceRule["employmentType"][] = [];
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
          in: employmentTypes as NonNullable<AudienceRule["employmentType"]>[],
        },
      });
    if (employeeIds.length) or.push({ id: { in: employeeIds } });

    if (or.length === 0) return null;
    return { ...base, OR: or };
  }
}
