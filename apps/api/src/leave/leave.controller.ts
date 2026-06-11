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
} from "@nestjs/common";
import { LeaveTypesService } from "./leave-types.service";
import { LeaveBalancesService } from "./leave-balances.service";
import { LeaveRequestsService } from "./leave-requests.service";
import {
  AdjustBalanceBody,
  ApplyLeaveBody,
  BalancesListQuery,
  CreateLeaveTypeBody,
  DecideBody,
  RequestsListQuery,
  UpdateLeaveTypeBody,
  type AdjustBalanceBodyT,
  type ApplyLeaveBodyT,
  type BalancesListQueryT,
  type CreateLeaveTypeBodyT,
  type DecideBodyT,
  type RequestsListQueryT,
  type UpdateLeaveTypeBodyT,
} from "./dto";
import { ZodBody } from "../common/zod-validation.pipe";
import { ZodQuery } from "../common/zod-query.pipe";
import { PaginationQuery, type PaginationQueryT } from "../common/pagination";
import { RequirePermission } from "../rbac/decorators/require-permission.decorator";
import {
  CurrentUser,
  type RequestUser,
} from "../auth/decorators/current-user.decorator";

@Controller("leave")
export class LeaveController {
  constructor(
    private readonly types: LeaveTypesService,
    private readonly balances: LeaveBalancesService,
    private readonly requests: LeaveRequestsService,
  ) {}

  // ─── Types ───────────────────────────────────────────────────────────

  @Get("types")
  @RequirePermission("leave.policy.read")
  listTypes(
    @Query(new ZodQuery(PaginationQuery)) q: PaginationQueryT,
  ): Promise<unknown> {
    return this.types.list(q);
  }

  @Post("types")
  @RequirePermission("leave.policy.write")
  createType(
    @Body(new ZodBody(CreateLeaveTypeBody)) body: CreateLeaveTypeBodyT,
  ): Promise<unknown> {
    return this.types.create(body);
  }

  @Patch("types/:id")
  @RequirePermission("leave.policy.write")
  updateType(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(UpdateLeaveTypeBody)) body: UpdateLeaveTypeBodyT,
  ): Promise<unknown> {
    return this.types.update(id, body);
  }

  @Delete("types/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("leave.policy.write")
  removeType(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    return this.types.remove(id);
  }

  @Post("types/:id/restore")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("leave.policy.write")
  restoreType(@Param("id", new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.types.restore(id);
  }

  // ─── Requests ─ static paths declared BEFORE :id captures ────────────

  @Post("requests")
  apply(
    @Body(new ZodBody(ApplyLeaveBody)) body: ApplyLeaveBodyT,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    return this.requests.apply(body, {
      userId: user.userId,
      organizationId: user.organizationId,
    });
  }

  @Get("requests/me")
  myRequests(
    @CurrentUser() user: RequestUser,
    @Query(new ZodQuery(RequestsListQuery)) q: RequestsListQueryT,
  ): Promise<unknown> {
    return this.requests.myList(
      { userId: user.userId, organizationId: user.organizationId },
      q,
    );
  }

  @Get("requests")
  @RequirePermission("leave.read")
  listRequests(
    @Query(new ZodQuery(RequestsListQuery)) q: RequestsListQueryT,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    return this.requests.list(q, user.userId);
  }

  @Patch("requests/:id/cancel")
  cancel(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    return this.requests.cancel(id, {
      userId: user.userId,
      organizationId: user.organizationId,
    });
  }

  @Patch("requests/:id/approve")
  @RequirePermission("leave.approve")
  approve(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(DecideBody)) body: DecideBodyT,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    return this.requests.approve(id, body, {
      userId: user.userId,
      organizationId: user.organizationId,
    });
  }

  @Patch("requests/:id/reject")
  @RequirePermission("leave.reject")
  reject(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(DecideBody)) body: DecideBodyT,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    return this.requests.reject(id, body, {
      userId: user.userId,
      organizationId: user.organizationId,
    });
  }

  // ─── Balances ────────────────────────────────────────────────────────

  @Get("balances/me")
  myBalances(@CurrentUser() user: RequestUser): Promise<unknown> {
    return this.balances.myBalances({
      userId: user.userId,
      organizationId: user.organizationId,
    });
  }

  @Get("balances")
  @RequirePermission("leave.read")
  listBalances(
    @Query(new ZodQuery(BalancesListQuery)) q: BalancesListQueryT,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    return this.balances.list(q, user.userId);
  }

  @Patch("balances/:id")
  @RequirePermission("leave.balance.adjust")
  adjustBalance(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(AdjustBalanceBody)) body: AdjustBalanceBodyT,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    return this.balances.adjust(id, body, {
      userId: user.userId,
      organizationId: user.organizationId,
    });
  }
}
