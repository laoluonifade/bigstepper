import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from '../payments/payments.service';
import { FundWalletDto } from './fund-wallet.dto';
import { WalletsService } from './wallets.service';
import { Throttle } from '@nestjs/throttler';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService, private readonly paymentsService: PaymentsService) {}

  @Get() get(@CurrentUser() user: AuthenticatedUser) {
    return this.walletsService.get(user.id);
  }

  @Get('transactions') transactions(@CurrentUser() user: AuthenticatedUser) {
    return this.walletsService.transactions(user.id);
  }

  @Post('fund')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  fund(@CurrentUser() user: AuthenticatedUser, @Body() body: FundWalletDto) {
    return this.paymentsService.fundWallet(user.id, body.amountKobo);
  }
}
