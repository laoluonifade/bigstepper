import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PAYMENT_EVENTS_QUEUE } from './payments.constants';
import { PaymentsService } from './payments.service';
import { CreateRecipientDto } from './payout.dto';
import { Throttle } from '@nestjs/throttler';

@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    @InjectQueue(PAYMENT_EVENTS_QUEUE) private readonly eventsQueue: Queue,
  ) {}

  @Post('tables/:id/checkout')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  checkout(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) tableId: string) {
    return this.paymentsService.checkout(user.id, tableId);
  }

  @Post(['tables/:id/enter-wallet', 'challenges/:id/enter-wallet'])
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  enterWithWallet(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) tableId: string) {
    return this.paymentsService.enterWithWallet(user.id, tableId);
  }

  @Get('payments/:reference/status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser, @Param('reference') reference: string) {
    return this.paymentsService.status(user.id, reference);
  }

  @Get('me/rewards')
  @UseGuards(JwtAuthGuard)
  rewards(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.rewards(user.id);
  }

  @Post('me/payout-recipient')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  recipient(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateRecipientDto) {
    return this.paymentsService.createPayoutRecipient(user.id, body);
  }

  @Post('me/rewards/:awardId/payout')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  requestPayout(@CurrentUser() user: AuthenticatedUser, @Param('awardId', ParseUUIDPipe) awardId: string) {
    return this.paymentsService.requestPayout(user.id, awardId);
  }

  @Post('creators/me/earnings/:earningId/payout')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  requestCreatorPayout(@CurrentUser() user: AuthenticatedUser, @Param('earningId', ParseUUIDPipe) earningId: string) {
    return this.paymentsService.requestCreatorPayout(user.id, earningId);
  }

  @Post('webhooks/paystack')
  async webhook(
    @Req() request: RawBodyRequest<{ body: Record<string, unknown> }>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    if (!request.rawBody || !this.paymentsService.verifySignature(request.rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature');
    }
    const inbox = await this.paymentsService.storeWebhook(request.rawBody, request.body as Record<string, unknown>);
    if (inbox) await this.eventsQueue.add('process-paystack-webhook', { inboxId: inbox.id }, { jobId: `paystack-${inbox.id}`, attempts: 10, backoff: { type: 'exponential', delay: 2_000 } });
    return { received: true };
  }
}
