import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrivilegedGuard } from './privileged.guard';
import { PaymentsModule } from '../payments/payments.module';
import { AdminOnlyGuard } from './admin-only.guard';
import { AuthModule } from '../auth/auth.module';
import { PrizesModule } from '../prizes/prizes.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';

@Module({
  imports: [PaymentsModule, AuthModule, PrizesModule],
  controllers: [AdminController, AdminAuthController],
  providers: [AdminService, AdminAuthService, PrivilegedGuard, AdminOnlyGuard],
})
export class AdminModule {}
