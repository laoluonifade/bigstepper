import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateReportDto, ResolveReportDto } from './safety.dto';
import { SafetyRepository } from './safety.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class SafetyService {
  constructor(private readonly dataSource: DataSource, private readonly repo: SafetyRepository) {}

  private async runnerId(username: string) {
    const userId = await this.repo.userIdByUsername(username);
    if (!userId) throw new NotFoundException('Runner not found');
    return userId;
  }

  async block(userId: string, username: string) {
    const blockedId = await this.runnerId(username);
    if (blockedId === userId) throw new BadRequestException('You can’t block yourself');
    await this.dataSource.transaction(async (manager) => {
      await this.repo.block(manager, userId, blockedId);
      await this.repo.unfollowBothWays(manager, userId, blockedId);
    });
    return { blocked: true };
  }

  async unblock(userId: string, username: string) {
    await this.repo.unblock(userId, await this.runnerId(username));
    return { blocked: false };
  }

  blocks(userId: string) {
    return this.repo.blocked(userId);
  }

  async report(reporterId: string, input: CreateReportDto) {
    const targetId = input.targetType === 'profile' ? await this.runnerId(input.target) : input.target;
    if (!UUID.test(targetId)) throw new BadRequestException('Choose something to report');
    const found = input.targetType === 'rant' ? await this.repo.rant(targetId)
      : input.targetType === 'comment' ? await this.repo.comment(targetId)
      : input.targetType === 'message' ? await this.repo.messageSeenBy(targetId, reporterId)
      : await this.repo.profile(targetId);
    if (!found) throw new NotFoundException('That’s no longer on Jump');
    if (found.userId === reporterId) throw new BadRequestException('You can’t report yourself');
    await this.repo.createReport({
      reporterId, targetType: input.targetType, targetId, targetUserId: found.userId,
      reason: input.reason, note: input.note?.trim() || null, snapshot: found.snapshot,
    });
    return { reported: true };
  }

  reports(status: string) {
    return this.repo.reports(status !== 'resolved');
  }

  async resolve(actorUserId: string, reportId: string, input: ResolveReportDto) {
    const note = input.note?.trim() || null;
    if (input.action === 'suspend' && !note) throw new BadRequestException('Say why the account is suspended');
    return this.dataSource.transaction(async (manager) => {
      const report = await this.repo.lockReport(manager, reportId);
      if (!report) throw new NotFoundException('Report not found');
      if (report.status !== 'OPEN') throw new ConflictException('This report was already handled');
      if (input.action === 'remove') {
        if (report.targetType === 'profile') throw new BadRequestException('A profile can’t be removed. Suspend the account instead.');
        await this.repo.removeContent(manager, report.targetType, report.targetId);
      }
      if (input.action === 'suspend') {
        if (!report.targetUserId) throw new ConflictException('That account no longer exists');
        await this.repo.suspend(manager, report.targetUserId, note!);
      }
      const actioned = input.action !== 'dismiss';
      const reporters = await this.repo.resolveOpen(manager, {
        targetType: report.targetType, targetId: report.targetId, status: actioned ? 'ACTIONED' : 'DISMISSED',
        resolution: input.action, note, actorUserId,
      });
      await this.repo.audit(manager, {
        actorUserId, action: `REPORT_${input.action.toUpperCase()}`, targetType: report.targetType, targetId: report.targetId,
        metadata: { reportId, targetUserId: report.targetUserId, note, reports: reporters.length },
      });
      await this.repo.thankReporters(manager, reporters, actioned);
      return { resolved: reporters.length, action: input.action };
    });
  }

  async liftSuspension(actorUserId: string, userId: string, reason: string) {
    return this.dataSource.transaction(async (manager) => {
      if (!(await this.repo.unsuspend(manager, userId))) throw new ConflictException('That account isn’t suspended');
      await this.repo.audit(manager, { actorUserId, action: 'SUSPENSION_LIFTED', targetType: 'user', targetId: userId, metadata: { reason } });
      return { suspended: false };
    });
  }
}
