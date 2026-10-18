import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrivilegedGuard } from './privileged.guard';
import { PaymentsModule } from '../payments/payments.module';
import { AdminOnlyGuard } from './admin-only.guard';

@Module({
  imports: [PaymentsModule],
  controllers: [AdminController],
  providers: [AdminService, PrivilegedGuard, AdminOnlyGuard],
})
export class AdminModule {}
