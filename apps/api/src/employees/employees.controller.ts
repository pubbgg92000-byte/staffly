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
import { EmployeesService } from "./employees.service";
import {
  CreateEmployeeBody,
  EmployeeListQuery,
  UpdateEmployeeBody,
  type CreateEmployeeBodyT,
  type EmployeeListQueryT,
  type UpdateEmployeeBodyT,
} from "./dto";
import { ZodBody } from "../common/zod-validation.pipe";
import { ZodQuery } from "../common/zod-query.pipe";
import { RequirePermission } from "../rbac/decorators/require-permission.decorator";

@Controller("employees")
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermission("employee.read")
  list(
    @Query(new ZodQuery(EmployeeListQuery)) q: EmployeeListQueryT,
  ): Promise<unknown> {
    return this.employees.list(q);
  }

  @Get(":id")
  @RequirePermission("employee.read")
  get(@Param("id", new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.employees.get(id);
  }

  @Post()
  @RequirePermission("employee.create")
  create(
    @Body(new ZodBody(CreateEmployeeBody)) body: CreateEmployeeBodyT,
  ): Promise<unknown> {
    return this.employees.create(body);
  }

  @Patch(":id")
  @RequirePermission("employee.update")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(UpdateEmployeeBody)) body: UpdateEmployeeBodyT,
  ): Promise<unknown> {
    return this.employees.update(id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("employee.delete")
  remove(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    return this.employees.remove(id);
  }
}
