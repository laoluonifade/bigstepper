import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EngagementService } from './engagement.service';
import { Notification } from './notification.entity';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(@InjectRepository(Notification) private readonly notifications: Repository<Notification>, private readonly dataSource: DataSource, private readonly engagement: EngagementService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.find({ where: { userId: user.id, inappAllowed: true }, order: { createdAt: 'DESC' }, take: 100 });
  }

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

  @Delete('push-token')
  async removePushToken(@CurrentUser() user: AuthenticatedUser, @Body() body: { token?: unknown }) {
    if (typeof body.token === 'string') await this.dataSource.query(`DELETE FROM "push_tokens" WHERE "token"=$1 AND "userId"=$2`, [body.token, user.id]);
    return { removed: true };
  }

  @Post('read-all')
  async readAll(@CurrentUser() user: AuthenticatedUser) {
    await this.notifications.update({ userId: user.id, readAt: IsNull(), inappAllowed: true }, { readAt: new Date() });
    return { success: true };
  }

  @Post(':id/click')
  async click(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const [row]=await this.dataSource.query(`SELECT n.id,d.id AS "deliveryId" FROM notifications n LEFT JOIN notification_deliveries d ON d."userId"=n."userId" AND d."sourceId"=n.id AND d.channel<>'inapp' AND d.status IN ('sent','delivered') WHERE n.id=$1 AND n."userId"=$2 LIMIT 1`,[id,user.id]);
    if(row) await this.engagement.event(user.id,'deep_link_click',`click:${id}`,row.deliveryId);
    return {recorded:!!row};
  }
  @Patch(':id/read')
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const notification=await this.notifications.findOne({where:{id,userId:user.id,inappAllowed:true}});
    if (notification) {
      await this.notifications.update({id,userId:user.id},{readAt:new Date()});
      await this.engagement.event(user.id,'opened',`opened:${id}`);
    }
    return { success: true };
  }
}
