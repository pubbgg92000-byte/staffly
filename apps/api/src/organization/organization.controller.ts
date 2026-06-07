import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from "@nestjs/common";
import { OrganizationService } from "./organization.service";
import {
  ConfirmLogoBody,
  LogoPresignBody,
  UpdateOrganizationBody,
  UpdateOrgSettingsBody,
  type ConfirmLogoBodyT,
  type LogoPresignBodyT,
  type UpdateOrganizationBodyT,
  type UpdateOrgSettingsBodyT,
} from "./dto";
import { ZodBody } from "../common/zod-validation.pipe";
import { RequirePermission } from "../rbac/decorators/require-permission.decorator";
import {
  CurrentUser,
  type RequestUser,
} from "../auth/decorators/current-user.decorator";

/**
 * Organization profile, branding, and settings (docs/03 §3; A-SET-001/002).
 * The org is implicit from the tenant context — no id param. Reads require
 * `org.settings.read`; writes require `org.settings.write`.
 */
@Controller()
export class OrganizationController {
  constructor(private readonly svc: OrganizationService) {}

  @Get("organization")
  @RequirePermission("org.settings.read")
  get(): Promise<unknown> {
    return this.svc.get();
  }

  @Patch("organization")
  @RequirePermission("org.settings.write")
  update(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBody(UpdateOrganizationBody)) body: UpdateOrganizationBodyT,
  ): Promise<unknown> {
    return this.svc.update(user.userId, body);
  }

  @Post("organization/logo/presign-upload")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("org.settings.write")
  presignLogo(
    @Body(new ZodBody(LogoPresignBody)) body: LogoPresignBodyT,
  ): Promise<unknown> {
    return this.svc.presignLogoUpload(body);
  }

  @Post("organization/logo")
  @RequirePermission("org.settings.write")
  confirmLogo(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBody(ConfirmLogoBody)) body: ConfirmLogoBodyT,
  ): Promise<unknown> {
    return this.svc.confirmLogo(user.userId, body.key);
  }

  @Get("organization/settings")
  @RequirePermission("org.settings.read")
  getSettings(): Promise<unknown> {
    return this.svc.getSettings();
  }

  @Patch("organization/settings")
  @RequirePermission("org.settings.write")
  updateSettings(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBody(UpdateOrgSettingsBody)) body: UpdateOrgSettingsBodyT,
  ): Promise<unknown> {
    return this.svc.updateSettings(user.userId, body);
  }
}
