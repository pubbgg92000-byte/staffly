import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { DocumentCategoriesService } from "./document-categories.service";
import { DocumentsService } from "./documents.service";
import {
  AcknowledgementsQuery,
  AudiencePreviewBody,
  CategoryListQuery,
  CreateCategoryBody,
  CreateDocumentBody,
  DocumentListQuery,
  MyDocumentsQuery,
  PresignUploadBody,
  ReplaceFileBody,
  UpdateCategoryBody,
  UpdateDocumentBody,
  type AcknowledgementsQueryT,
  type AudiencePreviewBodyT,
  type CategoryListQueryT,
  type CreateCategoryBodyT,
  type CreateDocumentBodyT,
  type DocumentListQueryT,
  type MyDocumentsQueryT,
  type PresignUploadBodyT,
  type ReplaceFileBodyT,
  type UpdateCategoryBodyT,
  type UpdateDocumentBodyT,
} from "./dto";
import { ZodBody } from "../common/zod-validation.pipe";
import { ZodQuery } from "../common/zod-query.pipe";
import { RequirePermission } from "../rbac/decorators/require-permission.decorator";
import {
  CurrentUser,
  type RequestUser,
} from "../auth/decorators/current-user.decorator";

@Controller()
export class DocumentsController {
  constructor(
    private readonly categories: DocumentCategoriesService,
    private readonly docs: DocumentsService,
  ) {}

  // ─── Categories ─────────────────────────────────────────────────────

  @Get("documents/categories")
  @RequirePermission("document.category.read")
  listCategories(
    @Query(new ZodQuery(CategoryListQuery)) q: CategoryListQueryT,
  ): Promise<unknown> {
    return this.categories.list(q);
  }

  @Post("documents/categories")
  @RequirePermission("document.category.write")
  createCategory(
    @Body(new ZodBody(CreateCategoryBody)) body: CreateCategoryBodyT,
  ): Promise<unknown> {
    return this.categories.create(body);
  }

  @Get("documents/categories/:id")
  @RequirePermission("document.category.read")
  getCategory(@Param("id", new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.categories.get(id);
  }

  @Patch("documents/categories/:id")
  @RequirePermission("document.category.write")
  updateCategory(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(UpdateCategoryBody)) body: UpdateCategoryBodyT,
  ): Promise<unknown> {
    return this.categories.update(id, body);
  }

  @Delete("documents/categories/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("document.category.write")
  removeCategory(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    return this.categories.remove(id);
  }

  // ─── Presign + employee feed (BEFORE :id catch-alls) ────────────────

  @Post("documents/files/presign-upload")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("document.create")
  presignUpload(
    @Body(new ZodBody(PresignUploadBody)) body: PresignUploadBodyT,
  ): Promise<unknown> {
    return this.docs.presignUpload(body);
  }

  @Get("me/documents")
  @RequirePermission("document.acknowledge")
  myDocuments(
    @CurrentUser() user: RequestUser,
    @Query(new ZodQuery(MyDocumentsQuery)) q: MyDocumentsQueryT,
  ): Promise<unknown> {
    return this.docs.myDocuments(
      { userId: user.userId, organizationId: user.organizationId },
      q,
    );
  }

  @Post("documents/audience/preview")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("document.create")
  previewAudience(
    @Body(new ZodBody(AudiencePreviewBody)) body: AudiencePreviewBodyT,
  ): Promise<unknown> {
    return this.docs.previewAudience(body);
  }

  // ─── Documents CRUD ─────────────────────────────────────────────────

  @Get("documents")
  @RequirePermission("document.read")
  list(
    @Query(new ZodQuery(DocumentListQuery)) q: DocumentListQueryT,
  ): Promise<unknown> {
    return this.docs.list(q);
  }

  @Post("documents")
  @RequirePermission("document.create")
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodBody(CreateDocumentBody)) body: CreateDocumentBodyT,
  ): Promise<unknown> {
    return this.docs.create(
      { userId: user.userId, organizationId: user.organizationId },
      body,
    );
  }

  @Get("documents/:id")
  @RequirePermission("document.read")
  get(@Param("id", new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.docs.get(id);
  }

  @Patch("documents/:id")
  @RequirePermission("document.update")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(UpdateDocumentBody)) body: UpdateDocumentBodyT,
  ): Promise<unknown> {
    return this.docs.update(
      { userId: user.userId, organizationId: user.organizationId },
      id,
      body,
    );
  }

  @Post("documents/:id/replace")
  @RequirePermission("document.update")
  replace(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(ReplaceFileBody)) body: ReplaceFileBodyT,
  ): Promise<unknown> {
    return this.docs.replaceFile(
      { userId: user.userId, organizationId: user.organizationId },
      id,
      body,
    );
  }

  @Post("documents/:id/publish")
  @RequirePermission("document.update")
  publish(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.docs.publish(
      { userId: user.userId, organizationId: user.organizationId },
      id,
    );
  }

  @Post("documents/:id/archive")
  @RequirePermission("document.delete")
  archive(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    return this.docs.archive(
      { userId: user.userId, organizationId: user.organizationId },
      id,
    );
  }

  @Delete("documents/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("document.delete")
  remove(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.docs.softDelete(
      { userId: user.userId, organizationId: user.organizationId },
      id,
    );
  }

  // ─── Download URLs ──────────────────────────────────────────────────

  @Get("documents/:id/download-url")
  @RequirePermission("document.read")
  downloadUrl(@Param("id", new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.docs.getDownloadUrlForVersion(id);
  }

  @Get("documents/:id/versions/:versionNo/download-url")
  @RequirePermission("document.read")
  downloadVersionUrl(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("versionNo", new ParseIntPipe()) versionNo: number,
  ): Promise<unknown> {
    return this.docs.getDownloadUrlForVersion(id, versionNo);
  }

  // ─── Acknowledgements ───────────────────────────────────────────────

  @Post("documents/:id/acknowledge")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("document.acknowledge")
  acknowledge(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<unknown> {
    const ip = req.ip ?? req.socket?.remoteAddress ?? null;
    const ua = req.headers["user-agent"] ?? null;
    return this.docs.acknowledge(
      {
        userId: user.userId,
        organizationId: user.organizationId,
        ipAddress: ip,
        userAgent: ua,
      },
      id,
    );
  }

  @Get("documents/:id/acknowledgements")
  @RequirePermission("document.read")
  listAcknowledgements(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query(new ZodQuery(AcknowledgementsQuery)) q: AcknowledgementsQueryT,
  ): Promise<unknown> {
    return this.docs.listAcknowledgements(id, q);
  }

  @Get("documents/:id/pending")
  @RequirePermission("document.read")
  async listPending(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<{ pendingEmployeeIds: string[] }> {
    const ids = await this.docs.listPendingAckEmployees(id);
    return { pendingEmployeeIds: ids };
  }
}
