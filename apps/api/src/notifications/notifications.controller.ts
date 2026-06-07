import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { MyNotificationsQuery, type MyNotificationsQueryT } from "./dto";
import { ZodQuery } from "../common/zod-query.pipe";
import {
  CurrentUser,
  type RequestUser,
} from "../auth/decorators/current-user.decorator";

/**
 * Self-scoped notification endpoints (docs/03 §13). Every route is auth-only:
 * a user may only ever read/mark their OWN notifications, enforced in the
 * service by filtering on `userId` in addition to the tenant scope. No
 * notification.* permission exists or is required.
 *
 * The static `read-all` and `unread-count` routes are declared before the
 * dynamic `:id/read` route so Nest never tries to parse those segments as a
 * UUID param.
 */
@Controller()
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get("me/notifications")
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodQuery(MyNotificationsQuery)) q: MyNotificationsQueryT,
  ): Promise<unknown> {
    return this.svc.list(user.userId, q);
  }

  @Get("me/notifications/unread-count")
  unreadCount(@CurrentUser() user: RequestUser): Promise<unknown> {
    return this.svc.unreadCount(user.userId);
  }

  @Post("me/notifications/read-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  readAll(@CurrentUser() user: RequestUser): Promise<void> {
    return this.svc.markAllRead(user.userId);
  }

  @Post("me/notifications/:id/read")
  @HttpCode(HttpStatus.NO_CONTENT)
  read(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.svc.markRead(user.userId, id);
  }
}
