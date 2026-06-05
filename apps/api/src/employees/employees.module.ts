import { Module } from "@nestjs/common";
import { EmployeesController } from "./employees.controller";
import { EmployeesService } from "./employees.service";
import { RbacModule } from "../rbac/rbac.module";

@Module({
  imports: [RbacModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
