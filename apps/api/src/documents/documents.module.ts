import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { DocumentCategoriesService } from "./document-categories.service";
import { DocumentAudienceResolverService } from "./document-audience-resolver.service";
import { RbacModule } from "../rbac/rbac.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [RbacModule, StorageModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentCategoriesService,
    DocumentAudienceResolverService,
  ],
  exports: [
    DocumentsService,
    DocumentCategoriesService,
    DocumentAudienceResolverService,
  ],
})
export class DocumentsModule {}
