import { Controller, Get } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { RequirePermission } from "../rbac/decorators/require-permission.decorator";
import {
  CurrentUser,
  type RequestUser,
} from "../auth/decorators/current-user.decorator";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get("admin")
  @RequirePermission("dashboard.view")
  admin(): Promise<unknown> {
    return this.svc.admin();
  }

  /**
   * Employee dashboard is gated by self-ownership rather than a permission
   * key (per docs/03 §12.2). Any authenticated user with an employee row
   * sees their own data. Cross-employee reads are impossible because the
   * service resolves the employee from `userId`.
   */
  @Get("employee")
  employee(@CurrentUser() user: RequestUser): Promise<unknown> {
    return this.svc.employee(user.userId);
  }
}
