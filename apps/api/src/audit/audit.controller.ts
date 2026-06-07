import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditLogListQuery, type AuditLogListQueryT } from "./dto";
import { ZodQuery } from "../common/zod-query.pipe";
import { RequirePermission } from "../rbac/decorators/require-permission.decorator";

@Controller("audit-logs")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission("audit.read")
  list(
    @Query(new ZodQuery(AuditLogListQuery)) q: AuditLogListQueryT,
  ): Promise<unknown> {
    return this.audit.list(q);
  }

  @Get(":id")
  @RequirePermission("audit.read")
  get(@Param("id", new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.audit.get(id);
  }
}
