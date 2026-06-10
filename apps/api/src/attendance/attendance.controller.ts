import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { AttendanceService } from "./attendance.service";
import { AttendancePoliciesService } from "./policies.service";
import { RegularizationsService } from "./regularizations.service";
import {
  CheckInBody,
  CheckOutBody,
  CreatePolicyBody,
  CreateRegularizationBody,
  DecideRegularizationBody,
  RecordsListQuery,
  RegularizationsListQuery,
  UpdatePolicyBody,
  type CheckInBodyT,
  type CheckOutBodyT,
  type CreatePolicyBodyT,
  type CreateRegularizationBodyT,
  type DecideRegularizationBodyT,
  type RecordsListQueryT,
  type RegularizationsListQueryT,
  type UpdatePolicyBodyT,
} from "./dto";
import { ZodBody } from "../common/zod-validation.pipe";
import { ZodQuery } from "../common/zod-query.pipe";
import { PaginationQuery, type PaginationQueryT } from "../common/pagination";
import { RequirePermission } from "../rbac/decorators/require-permission.decorator";
import {
  CurrentUser,
  type RequestUser,
} from "../auth/decorators/current-user.decorator";

@Controller()
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly policies: AttendancePoliciesService,
    private readonly regularizations: RegularizationsService,
  ) {}

  // ─── Policies ──────────────────────────────────────────────────────────

  @Get("attendance-policies")
  @RequirePermission("attendance.policy.read")
  listPolicies(
    @Query(new ZodQuery(PaginationQuery)) q: PaginationQueryT,
  ): Promise<unknown> {
    return this.policies.list(q);
  }

  @Get("attendance-policies/:id")
  @RequirePermission("attendance.policy.read")
  getPolicy(@Param("id", new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.policies.get(id);
  }

  @Post("attendance-policies")
  @RequirePermission("attendance.policy.write")
  createPolicy(
    @Body(new ZodBody(CreatePolicyBody)) body: CreatePolicyBodyT,
  ): Promise<unknown> {
    return this.policies.create(body);
  }

  @Patch("attendance-policies/:id")
  @RequirePermission("attendance.policy.write")
  updatePolicy(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(UpdatePolicyBody)) body: UpdatePolicyBodyT,
  ): Promise<unknown> {
    return this.policies.update(id, body);
  }

  @Delete("attendance-policies/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("attendance.policy.write")
  removePolicy(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    return this.policies.remove(id);
  }

  // ─── Records / check-in-out ───────────────────────────────────────────

  /** Self check-in (no body fields required) or admin punching another employee. */
  @Post("attendance/check-in")
  checkIn(
    @Body(new ZodBody(CheckInBody)) body: CheckInBodyT,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.attendance.checkIn(body, {
      userId: user.userId,
      organizationId: user.organizationId,
      ipAddress: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : null,
    });
  }

  @Post("attendance/check-out")
  checkOut(
    @Body(new ZodBody(CheckOutBody)) body: CheckOutBodyT,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.attendance.checkOut(body, {
      userId: user.userId,
      organizationId: user.organizationId,
      ipAddress: req.ip ?? null,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : null,
    });
  }

  @Get("attendance/me")
  myToday(@CurrentUser() user: RequestUser): Promise<unknown> {
    return this.attendance.myToday({
      userId: user.userId,
      organizationId: user.organizationId,
    });
  }

  // ─── Regularizations (declared BEFORE /attendance/:id so static paths win) ─

  @Post("attendance/regularizations")
  createRegularization(
    @Body(new ZodBody(CreateRegularizationBody))
    body: CreateRegularizationBodyT,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    return this.regularizations.create(body, {
      userId: user.userId,
      organizationId: user.organizationId,
    });
  }

  @Get("attendance/regularizations")
  @RequirePermission("attendance.approve")
  listRegularizations(
    @Query(new ZodQuery(RegularizationsListQuery))
    q: RegularizationsListQueryT,
  ): Promise<unknown> {
    return this.regularizations.list(q);
  }

  @Post("attendance/regularizations/:id/decide")
  @RequirePermission("attendance.approve")
  decide(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(DecideRegularizationBody))
    body: DecideRegularizationBodyT,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    return this.regularizations.decide(id, body, {
      userId: user.userId,
      organizationId: user.organizationId,
    });
  }

  // ─── Records (declared AFTER static paths) ─────────────────────────────

  @Get("attendance")
  @RequirePermission("attendance.read")
  listRecords(
    @Query(new ZodQuery(RecordsListQuery)) q: RecordsListQueryT,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    return this.attendance.list(q, user.userId);
  }

  @Get("attendance/:id")
  @RequirePermission("attendance.read")
  getRecord(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    return this.attendance.get(id, user.userId);
  }
}
