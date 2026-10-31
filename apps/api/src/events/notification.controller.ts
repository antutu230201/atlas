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
  async list(@Req() request: Request, @Query('limit') limit?: string) {
    const user = request.user as RequestUser;
    const parsed = Number(limit);
    return {
      data: await this.notificationService.list(user.id, Number.isInteger(parsed) ? parsed : 50),
    };
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
