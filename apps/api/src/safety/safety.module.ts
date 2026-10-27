import { Module } from '@nestjs/common';
import { AdminOnlyGuard } from '../admin/admin-only.guard';
import { PrivilegedGuard } from '../admin/privileged.guard';
import { SafetyAdminController, SafetyController } from './safety.controller';
import { SafetyRepository } from './safety.repository';
import { SafetyService } from './safety.service';

@Module({
  controllers: [SafetyController, SafetyAdminController],
  providers: [SafetyService, SafetyRepository, PrivilegedGuard, AdminOnlyGuard],
})
export class SafetyModule {}
