import { enrolClubMembers } from '../tables/club-competitions';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { creditActivities } from '../tables/competition-credits';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { CompetitionTable } from '../tables/competition-table.entity';
import { TableRegistration } from '../tables/table-registration.entity';
import { User } from '../users/user.entity';
import { PaymentIntent } from './payment-intent.entity';
import { PaystackClient } from './paystack.client';
import { ProviderWebhook } from './provider-webhook.entity';
import { CreateRecipientDto } from './payout.dto';
import * as bcrypt from 'bcrypt';
import { AmlService } from '../aml/aml.service';
import { announceCompetition, assertCountryEligible } from '../tables/club-challenges';
import { PaymentsRepository } from './payments.repository';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentIntent) private readonly intents: Repository<PaymentIntent>,
    @InjectRepository(ProviderWebhook) private readonly webhooks: Repository<ProviderWebhook>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly paystack: PaystackClient,
    private readonly aml: AmlService,
    private readonly repo: PaymentsRepository,
  ) {}

  private returnUrl() {
    const origin = this.config.getOrThrow<string>('WEB_ORIGIN').split(',')[0].trim().replace(/\/+$/, '');
    return `${origin}/payments/return`;
  }

  async checkout(userId: string, tableId: string) {
    this.assertPaidEnabled();
    const [user, table] = await Promise.all([
      this.dataSource.getRepository(User).findOne({ where: { id: userId } }),
      this.dataSource.getRepository(CompetitionTable).findOne({ where: { id: tableId } }),
    ]);
    if (!user || !table || table.type !== 'paid') throw new NotFoundException('Paid competition not found');
    if (!user.emailVerified) throw new ForbiddenException('Verify your email before entering a paid competition');
    await this.assertPaidEligibility(userId);
    if (table.creatorId === userId) throw new ForbiddenException('Competition hosts cannot enter their own paid prize');
    if (table.status !== 'OPEN_FOR_ENTRY' || (table.entryClosesAt && table.entryClosesAt <= new Date())) throw new ConflictException('Entry is closed');
    await assertCountryEligible(this.dataSource.manager, table, userId);
    if (table.entryFeeKobo <= 0) throw new BadRequestException('Competition fee is invalid');
    if (await this.dataSource.getRepository(TableRegistration).exist({ where: { tableId, userId } })) throw new ConflictException('You already joined this competition');
    if (await this.intents.exist({ where: { userId, tableId, purpose: 'CHALLENGE_ENTRY', status: In(['INITIATED', 'PENDING', 'RECONCILIATION_REQUIRED']) } })) {
      throw new ConflictException('An entry payment is still in progress or under review');
    }

    const intent = await this.intents.save(this.intents.create({
      userId, tableId, reference: `jump-${randomUUID()}`, amountKobo: table.entryFeeKobo, currency: 'NGN',
      purpose: 'CHALLENGE_ENTRY', status: 'INITIATED', providerStatus: null, providerTransactionId: null, expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    }));
    try {
      const initialized = await this.paystack.initialize({
        email: user.email, amount: intent.amountKobo, currency: intent.currency, reference: intent.reference,
        metadata: JSON.stringify({ payment_intent_id: intent.id }),
        callback_url: this.returnUrl(),
      });
      await this.intents.update({ id: intent.id }, { status: 'PENDING', providerStatus: 'initialized' });
      return { authorizationUrl: initialized.authorization_url, accessCode: initialized.access_code, reference: intent.reference };
    } catch (error) {
      await this.intents.update({ id: intent.id }, { status: 'FAILED', providerStatus: 'initialization_failed' });
      throw error;
    }
  }

  async fundPrize(userId: string, tableId: string, amountKobo: number) {
    this.assertPaidEnabled();
    const [user, table] = await Promise.all([
      this.dataSource.getRepository(User).findOne({ where: { id: userId } }),
      this.dataSource.getRepository(CompetitionTable).findOne({ where: { id: tableId, type: 'sponsored' } }),
    ]);
    if (!user || !table) throw new NotFoundException('Funded competition not found');
    if (table.guaranteedPrizeKobo !== null && userId !== table.creatorId) throw new ForbiddenException('Only the host can fund a fixed competition');
    if (table.guaranteedPrizeKobo !== null && table.guaranteedPrizeKobo < 1_000_000) throw new BadRequestException('Fixed contributions must be at least ₦10,000');
    if (!user.emailVerified) throw new ForbiddenException('Verify your email before funding a competition');
    await this.assertPaidEligibility(userId);
    const legacyFixed = table.guaranteedPrizeKobo !== null;
    if (!Number.isSafeInteger(amountKobo) || amountKobo < 100 || amountKobo > (legacyFixed ? 1_000_000_000 : 100_000_000)) throw new BadRequestException('Funding amount is outside the allowed range');
    await this.aml.assertPrizeFunding(amountKobo);
    if ((legacyFixed ? table.status !== 'PENDING_FUNDING' || amountKobo !== table.guaranteedPrizeKobo : !['OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED'].includes(table.status)) ||
        (table.scoringClosesAt && table.scoringClosesAt <= new Date())) throw new ConflictException('Prize funding is unavailable or the amount is invalid');
    const pending = await this.intents.exist({ where: { userId, tableId, purpose: 'SPONSOR_FUNDING', status: In(['INITIATED', 'PENDING', 'RECONCILIATION_REQUIRED']) } });
    if (pending) throw new ConflictException('A funding payment is still in progress or under review; check its status');
    const intent = await this.intents.save(this.intents.create({
      userId, tableId, purpose: 'SPONSOR_FUNDING', reference: `jump-prize-${randomUUID()}`,
      amountKobo, currency: 'NGN', status: 'INITIATED', providerStatus: null,
      providerTransactionId: null, expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    }));
    try {
      const initialized = await this.paystack.initialize({
        email: user.email, amount: intent.amountKobo, currency: intent.currency, reference: intent.reference,
        metadata: JSON.stringify({ payment_intent_id: intent.id, purpose: intent.purpose }),
        callback_url: this.returnUrl(),
      });
      await this.intents.update({ id: intent.id }, { status: 'PENDING', providerStatus: 'initialized' });
      return { authorizationUrl: initialized.authorization_url, accessCode: initialized.access_code, reference: intent.reference };
    } catch (error) {
      await this.intents.update({ id: intent.id }, { status: 'FAILED', providerStatus: 'initialization_failed' });
      throw error;
    }
  }

  async fundWallet(userId: string, amountKobo: number) {
    this.assertPaidEnabled();
    const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.emailVerified) throw new ForbiddenException('Verify your email before adding funds');
    await this.assertPaidEligibility(userId);
    await this.aml.assertWalletFunding(userId, amountKobo);
    const intent = await this.intents.save(this.intents.create({
      userId,
      tableId: null,
      purpose: 'WALLET_FUNDING',
      reference: `jump-wallet-${randomUUID()}`,
      amountKobo,
      currency: 'NGN',
      status: 'INITIATED',
      providerStatus: null,
      providerTransactionId: null,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    }));
    try {
      const initialized = await this.paystack.initialize({
        email: user.email,
        amount: intent.amountKobo,
        currency: intent.currency,
        reference: intent.reference,
        metadata: JSON.stringify({ payment_intent_id: intent.id, purpose: intent.purpose }),
        callback_url: this.returnUrl(),
      });
      await this.intents.update({ id: intent.id }, { status: 'PENDING', providerStatus: 'initialized' });
      return { authorizationUrl: initialized.authorization_url, accessCode: initialized.access_code, reference: intent.reference };
    } catch (error) {
      await this.intents.update({ id: intent.id }, { status: 'FAILED', providerStatus: 'initialization_failed' });
      throw error;
    }
  }

  async enterWithWallet(userId: string, tableId: string) {
    this.assertPaidEnabled();
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId } });
      const table = await manager.findOne(CompetitionTable, { where: { id: tableId, type: 'paid' }, lock: { mode: 'pessimistic_write' } });
      if (!user || !table) throw new NotFoundException('Paid competition not found');
      if (!user.emailVerified) throw new ForbiddenException('Verify your email before entering a paid competition');
      await this.assertPaidEligibility(userId, manager);
      if (table.creatorId === userId) throw new ForbiddenException('Competition hosts cannot enter their own paid prize');
      if (table.status !== 'OPEN_FOR_ENTRY' || (table.entryClosesAt && table.entryClosesAt <= new Date())) throw new ConflictException('Entry is closed');
      await assertCountryEligible(manager, table, userId);
      if (await manager.exists(TableRegistration, { where: { tableId, userId } })) throw new ConflictException('You already joined this competition');
      const count = await this.repo.entrantsOtherThan(manager, tableId, table.creatorId);
      if (table.capacity !== null && count >= table.capacity) throw new ConflictException('This competition is full');
      const wallet = await this.repo.lockWallet(manager, userId);
      if (wallet?.frozenAt) throw new ForbiddenException('Spending your entry credit is temporarily restricted; contact support');
      if (!wallet || wallet.balanceKobo < table.entryFeeKobo) throw new ConflictException('You don’t have enough entry credit for this entry');
      const balanceAfter = wallet.balanceKobo - table.entryFeeKobo;
      const reference = `jump-wallet-entry-${randomUUID()}`;
      await this.repo.setWalletBalance(manager, wallet.id, balanceAfter);
      await this.repo.recordWalletTransaction(manager, { walletId: wallet.id, type: 'CHALLENGE_ENTRY', amountKobo: -table.entryFeeKobo, balanceAfterKobo: balanceAfter, reference, description: 'Paid competition entry' });
      const registration = await manager.save(TableRegistration, manager.create(TableRegistration, { tableId, userId, paymentIntentId: null }));
      await creditActivities(manager, { tableId, userId });
      await this.repo.acceptPendingInvitation(manager, tableId, userId);
      await this.repo.postLedger(manager, { reference, description: 'Wallet-funded competition entry', debit: 'wallet_liability', credit: 'contest_entry_liability', amountKobo: table.entryFeeKobo });
      return registration;
    });
  }

  async status(userId: string, reference: string) {
    const intent = await this.intents.findOne({ where: { reference, userId } });
    if (!intent) throw new NotFoundException('Payment not found');
    return { reference: intent.reference, status: intent.status, amountKobo: intent.amountKobo, currency: intent.currency };
  }

  async verifyOwnPayment(userId: string, reference: string) {
    const intent = await this.intents.findOne({ where: { reference, userId } });
    if (!intent) throw new NotFoundException('Payment not found');
    if (['INITIATED', 'PENDING', 'RECONCILIATION_REQUIRED', 'FAILED'].includes(intent.status)) {
      this.assertProviderEnabled();
      await this.verifyAndFulfill(reference);
    }
    return this.status(userId, reference);
  }

  rewards(userId: string) {
    return this.repo.rewards(userId);
  }

  private bankCache: { at: number; banks: Array<{ code: string; name: string }> } | null = null;

  async banks() {
    if (this.bankCache && Date.now() - this.bankCache.at < 12 * 60 * 60 * 1000) return this.bankCache.banks;
    const banks = (await this.paystack.listBanks())
      .filter((bank) => bank.active && !bank.is_deleted && bank.type === 'nuban')
      .map((bank) => ({ code: bank.code, name: bank.name.trim() }))
      .filter((bank, index, all) => all.findIndex((other) => other.code === bank.code) === index)
      .sort((a, b) => a.name.localeCompare(b.name));
    this.bankCache = { at: Date.now(), banks };
    return banks;
  }

  async resolveAccount(accountNumber: string, bankCode: string) {
    const bank = (await this.banks()).find((item) => item.code === bankCode);
    if (!bank) throw new BadRequestException('Choose your bank from the list');
    try {
      const account = await this.paystack.resolveAccount(accountNumber, bankCode);
      return { accountName: account.account_name, accountNumber: account.account_number, bankCode, bankName: bank.name };
    } catch {
      throw new BadRequestException(`We couldn’t find that account number at ${bank.name}. Check it and try again.`);
    }
  }

  async createPayoutRecipient(userId: string, input: CreateRecipientDto) {
    this.assertPayoutsEnabled();
    await this.assertPaidEligibility(userId);
    if ((await this.aml.settings()).kycRequired) {
      throw new ForbiddenException('Payouts go to the bank account you verified. To use a different account, verify your identity again with it.');
    }
    const user = await this.dataSource.getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new ForbiddenException('Password confirmation failed');
    }
    const resolved = await this.resolveAccount(input.accountNumber, input.bankCode);
    const recipient = await this.paystack.createRecipient({ type: 'nuban', name: resolved.accountName, account_number: input.accountNumber, bank_code: input.bankCode, currency: 'NGN' });
    return this.dataSource.transaction(async (manager) => {
      const replacing = await this.repo.hasRecipient(manager, userId);
      const availableForPayoutAt = replacing ? new Date(Date.now() + 24 * 60 * 60 * 1000) : new Date();
      const saved = await this.repo.saveRecipient(manager, {
        userId, providerRecipientCode: recipient.recipient_code, accountName: recipient.details.account_name, bankCode: input.bankCode,
        accountLast4: input.accountNumber.slice(-4), availableForPayoutAt, accountHash: this.aml.accountHash(input.bankCode, input.accountNumber),
      });
      await this.repo.audit(manager, {
        actorUserId: userId, action: replacing ? 'PAYOUT_RECIPIENT_REPLACED' : 'PAYOUT_RECIPIENT_CREATED', targetType: 'payout_recipient', targetId: saved.id,
        metadata: { accountLast4: input.accountNumber.slice(-4), availableForPayoutAt },
      });
      if (replacing) {
        await this.repo.notify(manager, {
          userId, type: 'PAYOUT_RECIPIENT_CHANGED', title: 'Payout account changed', link: '/rewards',
          body: 'Your payout account was changed. Payouts are paused for 24 hours; contact support immediately if this was not you.',
        });
      }
      return saved;
    });
  }

  async requestPayout(userId: string, awardId: string) {
    this.assertPayoutsEnabled();
    await this.assertPaidEligibility(userId);
    return this.dataSource.transaction(async (manager) => {
      const amountKobo = await this.repo.lockAwardAmount(manager, awardId, userId);
      if (amountKobo === undefined) throw new NotFoundException('Award not found');
      const holdReasons = await this.aml.assessPayout(manager, userId, amountKobo);
      const request = await this.repo.requestPrizePayout(manager, awardId, userId);
      if (!request) throw new ConflictException('Award is unavailable or a payout was already requested');
      await this.aml.holdPayout(manager, request.id, userId, holdReasons);
      return { ...request, riskHold: holdReasons.length > 0 };
    });
  }

  async requestCreatorPayout(userId: string, earningId: string) {
    this.assertPayoutsEnabled();
    await this.assertPaidEligibility(userId);
    return this.dataSource.transaction(async (manager) => {
      const amountKobo = await this.repo.lockCreatorEarningAmount(manager, earningId, userId);
      if (amountKobo === undefined) throw new NotFoundException('Creator earning not found');
      const holdReasons = await this.aml.assessPayout(manager, userId, amountKobo);
      const request = await this.repo.requestCreatorPayout(manager, earningId, userId);
      if (!request) throw new ConflictException('Creator earning is unavailable, has no payout recipient, or was already requested');
      await this.repo.setCreatorEarningStatus(manager, earningId, 'PENDING_PAYOUT');
      await this.aml.holdPayout(manager, request.id, userId, holdReasons);
      return { ...request, riskHold: holdReasons.length > 0 };
    });
  }

  listPayouts(view: 'pending' | 'history') {
    return this.repo.payouts(view);
  }

  async approvePayout(actorUserId: string, payoutId: string, note?: string) {
    this.assertPayoutsEnabled();
    const claimed = await this.dataSource.transaction(async (manager) => {
      const payout = await this.repo.lockPayoutForApproval(manager, payoutId);
      if (!payout) throw new NotFoundException('Payout request not found');
      if (payout.status !== 'PENDING_APPROVAL') throw new ConflictException('This payout was already reviewed');
      if (payout.userId === actorUserId) throw new ForbiddenException('You can’t approve a payout to yourself');
      if (payout.blocked) throw new ConflictException('The recipient or competition funding is under a payment hold');
      if (new Date(payout.availableForPayoutAt) > new Date()) throw new ConflictException('Their bank details changed recently, so this payout is on a 24-hour security hold');
      await this.aml.assertApprovable(manager, payout, note);
      const reference = `payout-${randomUUID()}`;
      await this.repo.startPayout(manager, payoutId, actorUserId, note?.trim() || null, reference);
      await this.repo.audit(manager, {
        actorUserId, action: 'PAYOUT_APPROVED', targetType: 'payout_request', targetId: payoutId,
        metadata: { amountKobo: payout.amountKobo, reference, userId: payout.userId, riskHold: payout.riskHold, note: note?.trim() || null },
      });
      return { ...payout, reference };
    });
    try {
      const transfer = await this.paystack.initiateTransfer({ source: 'balance', amount: claimed.amountKobo, recipient: claimed.providerRecipientCode, reference: claimed.reference, reason: 'Jump competition prize' });
      if (transfer.reference !== claimed.reference) throw new ServiceUnavailableException('Payment provider returned an unexpected transfer reference');
      await this.repo.recordTransfer(claimed.reference, transfer);
      await this.repo.notify(this.dataSource.manager, {
        userId: claimed.userId, type: 'PAYOUT_SENT', title: 'Your payout is on its way', link: '/rewards',
        body: `₦${(claimed.amountKobo / 100).toLocaleString('en-NG')} is being sent to your bank. It usually arrives within minutes.`,
      });
      return { reference: claimed.reference, status: transfer.status };
    } catch (error) {
      await this.repo.flagTransferForReconciliation(claimed.reference);
      throw error;
    }
  }

  async rejectPayout(actorUserId: string, payoutId: string, reason: string) {
    return this.dataSource.transaction(async (manager) => {
      const rejected = await this.repo.rejectPayout(manager, payoutId, actorUserId, reason);
      if (!rejected) throw new ConflictException('This payout was already reviewed');
      if (rejected.creatorEarningId) await this.repo.setCreatorEarningStatus(manager, rejected.creatorEarningId, 'EARNED');
      await this.repo.audit(manager, { actorUserId, action: 'PAYOUT_REJECTED', targetType: 'payout_request', targetId: payoutId, metadata: { reason, userId: rejected.userId } });
      await this.repo.notify(manager, { userId: rejected.userId, type: 'PAYOUT_REJECTED', title: 'Payout not approved', body: `${reason} You can request it again once that’s sorted.`, link: '/rewards' });
      return { id: rejected.id, status: 'REJECTED' };
    });
  }

  async reconcile() {
    this.assertProviderEnabled();
    const runId = await this.repo.startReconciliation();
    const [payments, transfers] = await Promise.all([this.repo.openPaymentReferences(), this.repo.openTransferReferences()]);
    const paymentResults = await Promise.allSettled(payments.map((reference) => this.verifyAndFulfill(reference)));
    const transferResults = await Promise.allSettled(transfers.map(async (reference) => {
      const transfer = await this.paystack.verifyTransfer(reference);
      if (['success', 'failed', 'reversed'].includes(transfer.status)) await this.applyTransferEvent(reference, `transfer.${transfer.status}`);
    }));
    const summary = {
      paymentsChecked: payments.length,
      transfersChecked: transfers.length,
      failures: [...paymentResults, ...transferResults].filter((result) => result.status === 'rejected').length,
    };
    await this.repo.finishReconciliation(runId, summary.failures ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED', summary);
    return summary;
  }

  async sweepAbandonedCheckouts() {
    if (!this.config.get<boolean>('PAID_CONTESTS_ENABLED')) return { checked: 0, failures: 0 };
    this.assertProviderEnabled();
    const payments = await this.repo.abandonedCheckoutReferences();
    let next = 0;
    let failures = 0;
    await Promise.all(Array.from({ length: Math.min(5, payments.length) }, async () => {
      while (next < payments.length) {
        const reference = payments[next++];
        try { await this.verifyAndFulfill(reference); }
        catch { failures++; }
      }
    }));
    return { checked: payments.length, failures };
  }

  verifySignature(rawBody: Buffer, signature?: string): boolean {
    if (!this.config.get<boolean>('PAID_CONTESTS_ENABLED') && !this.config.get<boolean>('PRIZE_PAYOUTS_ENABLED')) return false;
    if (!signature) return false;
    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!secret) return false;
    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
    const received = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
  }

  async storeWebhook(rawBody: Buffer, payload: Record<string, unknown>) {
    const eventType = typeof payload.event === 'string' ? payload.event : 'unknown';
    const dedupeKey = createHash('sha256').update(rawBody).digest('hex');
    try {
      return await this.webhooks.save(this.webhooks.create({ provider: 'paystack', dedupeKey, eventType, payload, processedAt: null }));
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') return null;
      throw error;
    }
  }

  async processWebhook(inboxId: string) {
    const inbox = await this.webhooks.findOne({ where: { id: inboxId } });
    if (!inbox || inbox.processedAt) return;
    if (inbox.eventType === 'charge.success') {
      const data = inbox.payload.data as { reference?: string } | undefined;
      if (data?.reference) await this.verifyAndFulfill(data.reference);
    } else if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(inbox.eventType)) {
      const data = inbox.payload.data as { reference?: string; status?: string } | undefined;
      if (data?.reference) await this.applyTransferEvent(data.reference, inbox.eventType);
    } else if (inbox.eventType.startsWith('charge.dispute.')) {
      const data = inbox.payload.data as { transaction?: { reference?: string } } | undefined;
      if (data?.transaction?.reference) await this.freezeDisputedFunds(data.transaction.reference, inbox.eventType);
    } else if (inbox.eventType.startsWith('customeridentification.')) {
      await this.aml.applyIdentificationEvent(inbox.eventType, inbox.payload.data as { customer_code?: string; reason?: string } | undefined);
    } else if (inbox.eventType.startsWith('refund.')) {
      const data = inbox.payload.data as { id?: number; status?: string; transaction?: { reference?: string } } | undefined;
      if (data?.transaction?.reference) {
        await this.dataSource.transaction((manager) => this.repo.applyRefundEvent(manager, data.transaction!.reference!, data.status === 'processed', data.id ? String(data.id) : null));
      }
    }
    await this.webhooks.update({ id: inbox.id }, { processedAt: new Date() });
  }

  private async verifyAndFulfill(reference: string) {
    const provider = await this.paystack.verifyTransaction(reference);
    const intent = await this.intents.findOne({ where: { reference } });
    if (!intent) return;
    if (provider.reference !== intent.reference || provider.amount !== intent.amountKobo || provider.currency !== intent.currency) {
      if (!['SUCCEEDED', 'REFUNDED', 'DISPUTED'].includes(intent.status)) await this.intents.update({ id: intent.id }, { status: 'RECONCILIATION_REQUIRED', providerStatus: provider.status });
      return;
    }
    if (provider.status !== 'success') {
      const expired = intent.createdAt.getTime() <= Date.now() - 15 * 60 * 1000;
      const failed = expired && ['abandoned', 'failed'].includes(provider.status);
      const review = provider.status === 'reversed';
      await this.repo.settleUnpaidIntent(intent.id, failed, review, provider.status);
      return;
    }
    if (intent.purpose === 'WALLET_FUNDING') {
      await this.fulfillWalletFunding(intent, provider);
      return;
    }
    if (intent.purpose === 'SPONSOR_FUNDING') {
      await this.fulfillPrizeFunding(intent, provider);
      return;
    }
    if (!intent.tableId) {
      await this.intents.update({ id: intent.id }, { status: 'RECONCILIATION_REQUIRED', providerStatus: provider.status });
      return;
    }
    const challengeId = intent.tableId;
    const needsRefund = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOneOrFail(PaymentIntent, { where: { id: intent.id }, lock: { mode: 'pessimistic_write' } });
      if (!['INITIATED', 'PENDING', 'RECONCILIATION_REQUIRED', 'FAILED'].includes(locked.status)) return false;
      const table = await manager.findOneOrFail(CompetitionTable, { where: { id: challengeId }, lock: { mode: 'pessimistic_write' } });
      const count = await this.repo.entrantsOtherThan(manager, table.id, table.creatorId);
      const blocked = await this.isPaidBlocked(locked.userId, manager);
      const alreadyRegistered = await manager.exists(TableRegistration, { where: { tableId: table.id, userId: locked.userId } });
      if (table.status !== 'OPEN_FOR_ENTRY' || (table.capacity !== null && count >= table.capacity) ||
          table.creatorId === locked.userId || blocked || alreadyRegistered) {
        locked.status = 'REFUND_PENDING';
        await manager.save(locked);
        await this.repo.requestRefund(manager, { paymentIntentId: locked.id, amountKobo: locked.amountKobo, currency: locked.currency, reason: 'Competition entry unavailable' });
        return true;
      }
      locked.status = 'SUCCEEDED'; locked.providerStatus = provider.status; locked.providerTransactionId = String(provider.id);
      await manager.save(locked);
      await manager.save(TableRegistration, manager.create(TableRegistration, { tableId: table.id, userId: locked.userId, paymentIntentId: locked.id }));
      await creditActivities(manager, { tableId: table.id, userId: locked.userId });
      await this.repo.acceptPendingInvitation(manager, table.id, locked.userId);
      await this.repo.postLedger(manager, { reference: `payment:${locked.reference}`, description: 'Verified Paystack competition entry', debit: 'processor_clearing', credit: 'contest_entry_liability', amountKobo: locked.amountKobo });
      return false;
    });
    if (needsRefund) {
      const refund = await this.paystack.createRefund({ transaction: reference, amount: intent.amountKobo, currency: intent.currency, merchant_note: 'Automatic refund: competition unavailable' });
      await this.repo.recordRefund(intent.id, refund);
    }
  }

  private async fulfillPrizeFunding(intent: PaymentIntent, provider: { id: number; status: string }) {
    const needsRefund = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOneOrFail(PaymentIntent, { where: { id: intent.id }, lock: { mode: 'pessimistic_write' } });
      if (!['INITIATED', 'PENDING', 'RECONCILIATION_REQUIRED', 'FAILED'].includes(locked.status)) return false;
      const table = locked.tableId ? await manager.findOne(CompetitionTable, { where: { id: locked.tableId }, lock: { mode: 'pessimistic_write' } }) : null;
      const legacyFixed = Boolean(table && table.guaranteedPrizeKobo !== null);
      if (!table || table.type !== 'sponsored' ||
          (table.guaranteedPrizeKobo !== null && locked.userId !== table.creatorId) ||
          (legacyFixed ? table.status !== 'PENDING_FUNDING' || table.guaranteedPrizeKobo !== locked.amountKobo : !['OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED'].includes(table.status)) ||
          (table.scoringClosesAt && table.scoringClosesAt <= new Date())) {
        locked.status = 'REFUND_PENDING';
        await manager.save(locked);
        await this.repo.requestRefund(manager, { paymentIntentId: locked.id, amountKobo: locked.amountKobo, currency: locked.currency, reason: 'Prize funding unavailable' });
        return true;
      }
      if (!legacyFixed) {
        if (await this.repo.sponsorFundingTotal(manager, table.id) + locked.amountKobo > 1_000_000_000) {
          locked.status = 'REFUND_PENDING';
          await manager.save(locked);
          await this.repo.requestRefund(manager, { paymentIntentId: locked.id, amountKobo: locked.amountKobo, currency: locked.currency, reason: 'Prize funding limit reached' });
          return true;
        }
      }
      locked.status = 'SUCCEEDED';
      locked.providerStatus = provider.status;
      locked.providerTransactionId = String(provider.id);
      await manager.save(locked);
      if (legacyFixed) table.status = 'OPEN_FOR_ENTRY';
      table.fundedAt ??= new Date();
      await manager.save(table);
      if (legacyFixed && table.communityId) await enrolClubMembers(manager, { tableId: table.id });
      if (legacyFixed) await announceCompetition(manager, table);
      await this.repo.postLedger(manager, { reference: `payment:${locked.reference}`, description: 'Verified funded competition prize', debit: 'processor_clearing', credit: 'sponsor_prize_liability', amountKobo: locked.amountKobo });
      return false;
    });
    if (needsRefund) {
      const refund = await this.paystack.createRefund({ transaction: intent.reference, amount: intent.amountKobo, currency: intent.currency, merchant_note: 'Automatic refund: prize funding unavailable' });
      await this.repo.recordRefund(intent.id, refund);
    }
  }

  private async fulfillWalletFunding(intent: PaymentIntent, provider: { id: number; status: string }) {
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOneOrFail(PaymentIntent, { where: { id: intent.id }, lock: { mode: 'pessimistic_write' } });
      if (!['INITIATED', 'PENDING', 'RECONCILIATION_REQUIRED', 'FAILED'].includes(locked.status)) return;
      const wallet = await this.repo.ensureWallet(manager, locked.userId);
      const balanceAfter = wallet.balanceKobo + locked.amountKobo;
      await this.repo.setWalletBalance(manager, wallet.id, balanceAfter);
      await this.repo.recordWalletTransaction(manager, { walletId: wallet.id, type: 'FUNDING', amountKobo: locked.amountKobo, balanceAfterKobo: balanceAfter, reference: locked.reference, description: 'Entry credit top-up' });
      locked.status = 'SUCCEEDED';
      locked.providerStatus = provider.status;
      locked.providerTransactionId = String(provider.id);
      await manager.save(locked);
      await this.repo.postLedger(manager, { reference: `payment:${locked.reference}`, description: 'Verified wallet funding', debit: 'processor_clearing', credit: 'wallet_liability', amountKobo: locked.amountKobo });
    });
  }

  private async applyTransferEvent(reference: string, eventType: string) {
    const status = eventType === 'transfer.success' ? 'SUCCEEDED' : eventType === 'transfer.reversed' ? 'REVERSED' : 'FAILED';
    await this.dataSource.transaction((manager) => this.repo.applyTransferEvent(manager, reference, status));
  }

  private async freezeDisputedFunds(reference: string, eventType: string) {
    await this.dataSource.transaction((manager) => this.repo.freezeDisputedPayer(manager, reference, eventType));
  }

  private assertPaidEnabled() {
    if (!this.config.get<boolean>('PAID_CONTESTS_ENABLED')) {
      throw new ServiceUnavailableException('Paid competitions are disabled');
    }
    this.assertProviderEnabled();
  }

  private assertPayoutsEnabled() {
    if (!this.config.get<boolean>('PRIZE_PAYOUTS_ENABLED')) {
      throw new ServiceUnavailableException('Prize payouts are disabled');
    }
    this.assertProviderEnabled();
    if (this.config.get('NODE_ENV') === 'production' &&
        (!this.config.get<boolean>('LEGAL_APPROVAL_CONFIRMED') || !this.config.get<boolean>('PAYSTACK_APPROVAL_CONFIRMED'))) {
      throw new ServiceUnavailableException('Prize payouts are disabled');
    }
  }

  private assertProviderEnabled() {
    const sandboxApproved = this.config.get('NODE_ENV') !== 'production' && this.config.get<string>('PAYSTACK_SECRET_KEY')?.startsWith('sk_test_');
    const liveApproved = this.config.get('NODE_ENV') === 'production' && this.config.get<boolean>('PAYSTACK_LIVE_ENABLED') &&
      this.config.get<string>('PAYSTACK_SECRET_KEY')?.startsWith('sk_live_');
    if ((!this.config.get<boolean>('PAID_CONTESTS_ENABLED') && !this.config.get<boolean>('PRIZE_PAYOUTS_ENABLED')) ||
        (!sandboxApproved && !liveApproved)) {
      throw new ServiceUnavailableException('Payment provider is disabled');
    }
  }

  private async assertPaidEligibility(userId: string, manager: import('typeorm').EntityManager = this.dataSource.manager) {
    if (await this.isPaidBlocked(userId, manager)) throw new ForbiddenException('Paid features are paused on this account after a payment dispute. Contact support.');
    await this.aml.assertVerified(userId, manager);
  }

  private async isPaidBlocked(userId: string, manager: import('typeorm').EntityManager = this.dataSource.manager) {
    return this.repo.isPaidBlocked(manager, userId);
  }
}
