import { Module } from "@nestjs/common";
import { LeaveController } from "./leave.controller";
import { LeaveTypesService } from "./leave-types.service";
import { LeaveBalancesService } from "./leave-balances.service";
import { LeaveRequestsService } from "./leave-requests.service";
import { RbacModule } from "../rbac/rbac.module";
import { HolidaysModule } from "../holidays/holidays.module";
import { MailerModule } from "../mailer/mailer.module";

@Module({
  imports: [RbacModule, HolidaysModule, MailerModule],
  controllers: [LeaveController],
  providers: [LeaveTypesService, LeaveBalancesService, LeaveRequestsService],
  exports: [LeaveTypesService, LeaveBalancesService, LeaveRequestsService],
})
export class LeaveModule {}
