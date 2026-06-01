import { Module } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { AttendancePoliciesService } from "./policies.service";
import { RegularizationsService } from "./regularizations.service";
import { RbacModule } from "../rbac/rbac.module";

@Module({
  imports: [RbacModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendancePoliciesService,
    RegularizationsService,
  ],
  exports: [
    AttendanceService,
    AttendancePoliciesService,
    RegularizationsService,
  ],
})
export class AttendanceModule {}
