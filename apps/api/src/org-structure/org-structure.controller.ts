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
import { DepartmentsService } from "./departments.service";
import { DesignationsService } from "./designations.service";
import { LocationsService } from "./locations.service";
import {
  CreateDepartmentBody,
  CreateDesignationBody,
  CreateLocationBody,
  UpdateDepartmentBody,
  UpdateDesignationBody,
  UpdateLocationBody,
  type CreateDepartmentBodyT,
  type CreateDesignationBodyT,
  type CreateLocationBodyT,
  type UpdateDepartmentBodyT,
  type UpdateDesignationBodyT,
  type UpdateLocationBodyT,
} from "./dto";
import { ZodBody } from "../common/zod-validation.pipe";
import { ZodQuery } from "../common/zod-query.pipe";
import { PaginationQuery, type PaginationQueryT } from "../common/pagination";
import { RequirePermission } from "../rbac/decorators/require-permission.decorator";

@Controller()
export class OrgStructureController {
  constructor(
    private readonly departments: DepartmentsService,
    private readonly designations: DesignationsService,
    private readonly locations: LocationsService,
  ) {}

  // ─── Departments ────────────────────────────────────────────────────────
  @Get("departments")
  @RequirePermission("org.structure.read")
  listDepartments(
    @Query(new ZodQuery(PaginationQuery)) q: PaginationQueryT,
  ): Promise<unknown> {
    return this.departments.list(q);
  }

  @Get("departments/:id")
  @RequirePermission("org.structure.read")
  getDepartment(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.departments.get(id);
  }

  @Post("departments")
  @RequirePermission("org.structure.write")
  createDepartment(
    @Body(new ZodBody(CreateDepartmentBody)) body: CreateDepartmentBodyT,
  ): Promise<unknown> {
    return this.departments.create(body);
  }

  @Patch("departments/:id")
  @RequirePermission("org.structure.write")
  updateDepartment(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(UpdateDepartmentBody)) body: UpdateDepartmentBodyT,
  ): Promise<unknown> {
    return this.departments.update(id, body);
  }

  @Delete("departments/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("org.structure.write")
  removeDepartment(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.departments.remove(id);
  }

  @Post("departments/:id/restore")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("org.structure.write")
  restoreDepartment(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.departments.restore(id);
  }

  // ─── Designations ───────────────────────────────────────────────────────
  @Get("designations")
  @RequirePermission("org.structure.read")
  listDesignations(
    @Query(new ZodQuery(PaginationQuery)) q: PaginationQueryT,
  ): Promise<unknown> {
    return this.designations.list(q);
  }

  @Get("designations/:id")
  @RequirePermission("org.structure.read")
  getDesignation(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.designations.get(id);
  }

  @Post("designations")
  @RequirePermission("org.structure.write")
  createDesignation(
    @Body(new ZodBody(CreateDesignationBody)) body: CreateDesignationBodyT,
  ): Promise<unknown> {
    return this.designations.create(body);
  }

  @Patch("designations/:id")
  @RequirePermission("org.structure.write")
  updateDesignation(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(UpdateDesignationBody)) body: UpdateDesignationBodyT,
  ): Promise<unknown> {
    return this.designations.update(id, body);
  }

  @Delete("designations/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("org.structure.write")
  removeDesignation(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.designations.remove(id);
  }

  @Post("designations/:id/restore")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("org.structure.write")
  restoreDesignation(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.designations.restore(id);
  }

  // ─── Locations ──────────────────────────────────────────────────────────
  @Get("locations")
  @RequirePermission("org.structure.read")
  listLocations(
    @Query(new ZodQuery(PaginationQuery)) q: PaginationQueryT,
  ): Promise<unknown> {
    return this.locations.list(q);
  }

  @Get("locations/:id")
  @RequirePermission("org.structure.read")
  getLocation(@Param("id", new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.locations.get(id);
  }

  @Post("locations")
  @RequirePermission("org.structure.write")
  createLocation(
    @Body(new ZodBody(CreateLocationBody)) body: CreateLocationBodyT,
  ): Promise<unknown> {
    return this.locations.create(body);
  }

  @Patch("locations/:id")
  @RequirePermission("org.structure.write")
  updateLocation(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(UpdateLocationBody)) body: UpdateLocationBodyT,
  ): Promise<unknown> {
    return this.locations.update(id, body);
  }

  @Delete("locations/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("org.structure.write")
  removeLocation(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    return this.locations.remove(id);
  }

  @Post("locations/:id/restore")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("org.structure.write")
  restoreLocation(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.locations.restore(id);
  }
}
