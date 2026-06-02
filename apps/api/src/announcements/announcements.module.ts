import { Module } from "@nestjs/common";
import { AnnouncementsController } from "./announcements.controller";
import { AnnouncementsService } from "./announcements.service";
import { AudienceResolverService } from "./audience-resolver.service";
import { RbacModule } from "../rbac/rbac.module";

@Module({
  imports: [RbacModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, AudienceResolverService],
  exports: [AnnouncementsService, AudienceResolverService],
})
export class AnnouncementsModule {}
