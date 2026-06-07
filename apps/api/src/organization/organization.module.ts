import { Module } from "@nestjs/common";
import { OrganizationController } from "./organization.controller";
import { OrganizationService } from "./organization.service";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [StorageModule],
  controllers: [OrganizationController],
  providers: [OrganizationService],
})
export class OrganizationModule {}
