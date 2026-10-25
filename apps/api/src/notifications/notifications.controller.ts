import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Notification } from './notification.entity';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(@InjectRepository(Notification) private readonly notifications: Repository<Notification>, private readonly dataSource: DataSource) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.find({ where: { userId: user.id }, order: { createdAt: 'DESC' }, take: 100 });
  }

  /** A phone signing up for pushes. The token moves to whoever signed in on that phone last. */
  @Post('push-token')
  async registerPushToken(@CurrentUser() user: AuthenticatedUser, @Body() body: { token?: unknown; platform?: unknown }) {
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null;
    if (!/^ExponentPushToken\[[A-Za-z0-9_-]+\]$/.test(token) || !platform) throw new BadRequestException('Invalid push token');
    await this.dataSource.query(
      `INSERT INTO "push_tokens" ("token","userId","platform") VALUES ($1,$2,$3)
       ON CONFLICT ("token") DO UPDATE SET "userId"=EXCLUDED."userId","platform"=EXCLUDED."platform","lastSeenAt"=now()`,
      [token, user.id, platform],
    );
    return { registered: true };
  }

  /** Signing out on a phone stops its pushes. */
  @Delete('push-token')
  async removePushToken(@CurrentUser() user: AuthenticatedUser, @Body() body: { token?: unknown }) {
    if (typeof body.token === 'string') await this.dataSource.query(`DELETE FROM "push_tokens" WHERE "token"=$1 AND "userId"=$2`, [body.token, user.id]);
    return { removed: true };
  }

  /** Opening the notifications list reads them all: the bell and the app badge clear. */
  @Post('read-all')
  async readAll(@CurrentUser() user: AuthenticatedUser) {
    await this.notifications.update({ userId: user.id, readAt: IsNull() }, { readAt: new Date() });
    return { success: true };
  }

  @Patch(':id/read')
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.update({ id, userId: user.id }, { readAt: new Date() });
    return { success: true };
  }
}
