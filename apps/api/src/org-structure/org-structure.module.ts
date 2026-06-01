import { Module } from "@nestjs/common";
import { OrgStructureController } from "./org-structure.controller";
import { DepartmentsService } from "./departments.service";
import { DesignationsService } from "./designations.service";
import { LocationsService } from "./locations.service";

@Module({
  controllers: [OrgStructureController],
  providers: [DepartmentsService, DesignationsService, LocationsService],
  exports: [DepartmentsService, DesignationsService, LocationsService],
})
export class OrgStructureModule {}
