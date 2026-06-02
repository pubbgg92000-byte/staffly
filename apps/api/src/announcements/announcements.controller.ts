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
import { AnnouncementsService } from "./announcements.service";
import {
  AcknowledgementsQuery,
  AnnouncementListQuery,
  AudiencePreviewBody,
  CreateAnnouncementBody,
  MyAnnouncementsQuery,
  PublishAnnouncementBody,
  UpdateAnnouncementBody,
  type AcknowledgementsQueryT,
  type AnnouncementListQueryT,
  type AudiencePreviewBodyT,
  type CreateAnnouncementBodyT,
  type MyAnnouncementsQueryT,
  type PublishAnnouncementBodyT,
  type UpdateAnnouncementBodyT,
} from "./dto";
import { ZodBody } from "../common/zod-validation.pipe";
import { ZodQuery } from "../common/zod-query.pipe";
import { RequirePermission } from "../rbac/decorators/require-permission.decorator";
import {
  CurrentUser,
  type RequestUser,
} from "../auth/decorators/current-user.decorator";

@Controller()
export class AnnouncementsController {
  constructor(private readonly svc: AnnouncementsService) {}

  // ─── Admin endpoints (docs/03 §10.1–§10.9) ───────────────────────────

  @Get("announcements")
  @RequirePermission("announcement.read")
  list(
    @Query(new ZodQuery(AnnouncementListQuery)) q: AnnouncementListQueryT,
  ): Promise<unknown> {
    return this.svc.list(q);
  }

  @Post("announcements")
  @RequirePermission("announcement.create")
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBody(CreateAnnouncementBody)) body: CreateAnnouncementBodyT,
  ): Promise<unknown> {
    return this.svc.create(
      { userId: user.userId, organizationId: user.organizationId },
      body,
    );
  }

  // /me feed declared BEFORE /:id so Nest does not match "me" as a UUID
  // param. (ParseUUIDPipe would reject it, but ordering keeps it tidy.)
  @Get("me/announcements")
  @RequirePermission("announcement.read")
  myFeed(
    @CurrentUser() user: RequestUser,
    @Query(new ZodQuery(MyAnnouncementsQuery)) q: MyAnnouncementsQueryT,
  ): Promise<unknown> {
    return this.svc.myFeed(
      { userId: user.userId, organizationId: user.organizationId },
      q,
    );
  }

  @Post("announcements/audience/preview")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("announcement.create")
  previewAudience(
    @Body(new ZodBody(AudiencePreviewBody)) body: AudiencePreviewBodyT,
  ): Promise<unknown> {
    return this.svc.previewAudience(body);
  }

  @Get("announcements/:id")
  @RequirePermission("announcement.read")
  get(@Param("id", new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.svc.get(id);
  }

  @Patch("announcements/:id")
  @RequirePermission("announcement.update")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(UpdateAnnouncementBody)) body: UpdateAnnouncementBodyT,
  ): Promise<unknown> {
    return this.svc.update(
      { userId: user.userId, organizationId: user.organizationId },
      id,
      body,
    );
  }

  @Post("announcements/:id/publish")
  @RequirePermission("announcement.publish")
  publish(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(PublishAnnouncementBody)) body: PublishAnnouncementBodyT,
  ): Promise<unknown> {
    return this.svc.publish(
      { userId: user.userId, organizationId: user.organizationId },
      id,
      body,
    );
  }

  @Post("announcements/:id/archive")
  @RequirePermission("announcement.delete")
  archive(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.svc.archive(
      { userId: user.userId, organizationId: user.organizationId },
      id,
    );
  }

  @Delete("announcements/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("announcement.delete")
  async archiveAlias(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.svc.archive(
      { userId: user.userId, organizationId: user.organizationId },
      id,
    );
  }

  @Post("announcements/:id/acknowledge")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("announcement.acknowledge")
  acknowledge(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.svc.acknowledge(
      { userId: user.userId, organizationId: user.organizationId },
      id,
    );
  }

  @Get("announcements/:id/acknowledgements")
  @RequirePermission("announcement.read")
  listAcknowledgements(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query(new ZodQuery(AcknowledgementsQuery)) q: AcknowledgementsQueryT,
  ): Promise<unknown> {
    return this.svc.listAcknowledgements(id, q);
  }
}
