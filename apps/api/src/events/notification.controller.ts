import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { NOTIFICATION_SERVICE_TOKEN } from '../tokens';
import { AuthGuard, type RequestUser } from '../auth/guards';
import type { NotificationService } from '../events/notification.service';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationController {
  constructor(
    @Inject(NOTIFICATION_SERVICE_TOKEN) private readonly notificationService: NotificationService,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('cursor') cursor?: string,
    @Query('unread') unread?: string,
  ) {
    const user = request.user as RequestUser;
    const parsed = Number(limit);
    // cursor 为上一页最后一条的 id：非法值直接忽略（回到第一页）
    const validCursor = cursor?.trim() ? { id: cursor.trim() } : undefined;
    const rows = await this.notificationService.list(user.id, {
      limit: Number.isInteger(parsed) ? parsed : 50,
      type,
      unreadOnly: unread === 'true',
      cursor: validCursor,
    });
    const pageSize = Number.isInteger(parsed) ? parsed : 50;
    const last = rows.at(-1);
    const nextCursor = last && rows.length >= pageSize ? last.id : null;
    return { data: { items: rows, nextCursor } };
  }

  @Get('unread-count')
  async unreadCount(@Req() request: Request) {
    const user = request.user as RequestUser;
    const count = await this.notificationService.unreadCount(user.id);
    return { data: { count } };
  }

  @Post(':id/read')
  @HttpCode(200)
  async markRead(@Param('id') id: string, @Req() request: Request) {
    const user = request.user as RequestUser;
    await this.notificationService.markRead(user.id, id);
    return { data: { read: id } };
  }

  @Post('read-all')
  @HttpCode(200)
  async markAllRead(@Req() request: Request) {
    const user = request.user as RequestUser;
    await this.notificationService.markAllRead(user.id);
    return { data: { ok: true } };
  }
}
