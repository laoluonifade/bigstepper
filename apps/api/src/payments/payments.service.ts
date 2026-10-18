import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { CompetitionTable } from '../tables/competition-table.entity';
import { TableRegistration } from '../tables/table-registration.entity';
import { User } from '../users/user.entity';
import { PaymentIntent } from './payment-intent.entity';
import { PaystackClient } from './paystack.client';
import { ProviderWebhook } from './provider-webhook.entity';
import { CreateRecipientDto } from './payout.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentIntent) private readonly intents: Repository<PaymentIntent>,
    @InjectRepository(ProviderWebhook) private readonly webhooks: Repository<ProviderWebhook>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly paystack: PaystackClient,
  ) {}

  async checkout(userId: string, tableId: string) {
    this.assertPaidEnabled();
    const [user, table] = await Promise.all([
      this.dataSource.getRepository(User).findOne({ where: { id: userId } }),
      this.dataSource.getRepository(CompetitionTable).findOne({ where: { id: tableId } }),
    ]);
    if (!user || !table || table.type !== 'paid') throw new NotFoundException('Paid table not found');
    if (!user.emailVerified) throw new ForbiddenException('Verify your email before entering a paid competition');
    await this.assertPaidEligibility(userId);
    if (table.creatorId === userId) throw new ForbiddenException('Challenge creators cannot enter their own paid challenge');
    if (table.status !== 'OPEN_FOR_ENTRY' || (table.entryClosesAt && table.entryClosesAt <= new Date())) throw new ConflictException('Entry is closed');
    if (table.entryFeeKobo <= 0) throw new BadRequestException('Table fee is invalid');
    if (await this.dataSource.getRepository(TableRegistration).exist({ where: { tableId, userId } })) throw new ConflictException('You already joined this table');

    const intent = await this.intents.save(this.intents.create({
      userId, tableId, reference: `jump-${randomUUID()}`, amountKobo: table.entryFeeKobo, currency: 'NGN',
      purpose: 'CHALLENGE_ENTRY', status: 'INITIATED', providerStatus: null, providerTransactionId: null, expiresAt: new Date(Date.now() + 20 * 60 * 1000),
    }));
    try {
      const initialized = await this.paystack.initialize({
        email: user.email, amount: intent.amountKobo, currency: intent.currency, reference: intent.reference,
        metadata: JSON.stringify({ payment_intent_id: intent.id }),
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
    if (!user.emailVerified) throw new ForbiddenException('Verify your email before funding a wallet');
    await this.assertPaidEligibility(userId);
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
      expiresAt: new Date(Date.now() + 20 * 60 * 1000),
    }));
    try {
      const initialized = await this.paystack.initialize({
        email: user.email,
        amount: intent.amountKobo,
        currency: intent.currency,
        reference: intent.reference,
        metadata: JSON.stringify({ payment_intent_id: intent.id, purpose: intent.purpose }),
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
      if (!user || !table) throw new NotFoundException('Paid challenge not found');
      if (!user.emailVerified) throw new ForbiddenException('Verify your email before entering a paid challenge');
      await this.assertPaidEligibility(userId, manager);
      if (table.creatorId === userId) throw new ForbiddenException('Challenge creators cannot enter their own paid challenge');
      if (table.status !== 'OPEN_FOR_ENTRY' || (table.entryClosesAt && table.entryClosesAt <= new Date())) throw new ConflictException('Entry is closed');
      if (await manager.exists(TableRegistration, { where: { tableId, userId } })) throw new ConflictException('You already joined this challenge');
      const count = await manager.count(TableRegistration, { where: { tableId } });
      if (table.capacity !== null && count >= table.capacity) throw new ConflictException('This challenge is full');
      const wallets = await manager.query(`SELECT "id","balanceKobo","frozenAt" FROM "wallets" WHERE "userId"=$1 FOR UPDATE`, [userId]) as Array<{ id: string; balanceKobo: string; frozenAt: Date | null }>;
      const wallet = wallets[0];
      if (wallet?.frozenAt) throw new ForbiddenException('Wallet spending is temporarily restricted; contact support');
      if (!wallet || Number(wallet.balanceKobo) < table.entryFeeKobo) throw new ConflictException('Insufficient wallet balance');
      const balanceAfter = Number(wallet.balanceKobo) - table.entryFeeKobo;
      const reference = `jump-wallet-entry-${randomUUID()}`;
      await manager.query(`UPDATE "wallets" SET "balanceKobo"=$1,"updatedAt"=now() WHERE "id"=$2`, [balanceAfter, wallet.id]);
      await manager.query(
        `INSERT INTO "wallet_transactions" ("walletId","type","amountKobo","balanceAfterKobo","reference","description") VALUES ($1,'CHALLENGE_ENTRY',$2,$3,$4,'Paid challenge entry')`,
        [wallet.id, -table.entryFeeKobo, balanceAfter, reference],
      );
      const registration = await manager.save(TableRegistration, manager.create(TableRegistration, { tableId, userId, paymentIntentId: null }));
      await this.postWalletEntryLedger(manager, reference, table.entryFeeKobo);
      return registration;
    });
  }

  async status(userId: string, reference: string) {
    const intent = await this.intents.findOne({ where: { reference, userId } });
    if (!intent) throw new NotFoundException('Payment not found');
    return { reference: intent.reference, status: intent.status, amountKobo: intent.amountKobo, currency: intent.currency };
  }

  rewards(userId: string) {
    return this.dataSource.query(`SELECT "id","tableId","grossPrizeKobo","platformFeeKobo","creatorCommissionKobo","amountKobo","currency","status","createdAt" FROM "prize_awards" WHERE "winnerUserId"=$1 ORDER BY "createdAt" DESC`, [userId]);
  }

  async createPayoutRecipient(userId: string, input: CreateRecipientDto) {
    this.assertPayoutsEnabled();
    await this.assertPaidEligibility(userId);
    const user = await this.dataSource.getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new ForbiddenException('Password confirmation failed');
    }
    const recipient = await this.paystack.createRecipient({ type: 'nuban', name: input.accountName.trim(), account_number: input.accountNumber, bank_code: input.bankCode, currency: 'NGN' });
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.query(`SELECT "id" FROM "payout_recipients" WHERE "userId"=$1 FOR UPDATE`, [userId]) as Array<{ id: string }>;
      const availableForPayoutAt = existing[0] ? new Date(Date.now() + 24 * 60 * 60 * 1000) : new Date();
      const rows = await manager.query(
        `INSERT INTO "payout_recipients" ("userId","providerRecipientCode","accountName","bankCode","accountLast4","availableForPayoutAt") VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT ("userId") DO UPDATE SET "providerRecipientCode"=EXCLUDED."providerRecipientCode","accountName"=EXCLUDED."accountName",
           "bankCode"=EXCLUDED."bankCode","accountLast4"=EXCLUDED."accountLast4","availableForPayoutAt"=EXCLUDED."availableForPayoutAt","updatedAt"=now()
         RETURNING "id","accountName","bankCode","accountLast4","currency","availableForPayoutAt"`,
        [userId, recipient.recipient_code, recipient.details.account_name, input.bankCode, input.accountNumber.slice(-4), availableForPayoutAt],
      ) as Array<Record<string, unknown>>;
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,$2,'payout_recipient',$3,$4)`,
        [userId, existing[0] ? 'PAYOUT_RECIPIENT_REPLACED' : 'PAYOUT_RECIPIENT_CREATED', rows[0].id, JSON.stringify({ accountLast4: input.accountNumber.slice(-4), availableForPayoutAt })],
      );
      if (existing[0]) {
        await manager.query(
          `INSERT INTO "notifications" ("userId","type","title","body") VALUES ($1,'PAYOUT_RECIPIENT_CHANGED','Payout account changed','Your payout account was changed. Payouts are paused for 24 hours; contact support immediately if this was not you.')`,
          [userId],
        );
      }
      return rows[0];
    });
  }

  async requestPayout(userId: string, awardId: string) {
    this.assertPayoutsEnabled();
    await this.assertPaidEligibility(userId);
    const rows = await this.dataSource.query(
      `INSERT INTO "payout_requests" ("awardId","recipientId")
       SELECT a."id",r."id" FROM "prize_awards" a JOIN "payout_recipients" r ON r."userId"=a."winnerUserId"
       WHERE a."id"=$1 AND a."winnerUserId"=$2 AND a."status"='PENDING_APPROVAL' AND r."availableForPayoutAt" <= now()
       ON CONFLICT ("awardId") DO NOTHING RETURNING *`, [awardId, userId],
    ) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new ConflictException('Award is unavailable or a payout was already requested');
    return rows[0];
  }

  async requestCreatorPayout(userId: string, earningId: string) {
    this.assertPayoutsEnabled();
    await this.assertPaidEligibility(userId);
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `INSERT INTO "payout_requests" ("creatorEarningId","recipientId")
         SELECT e."id",r."id" FROM "creator_earnings" e
         JOIN "creator_profiles" c ON c."id"=e."creatorProfileId"
         JOIN "payout_recipients" r ON r."userId"=c."userId"
         WHERE e."id"=$1 AND c."userId"=$2 AND e."status"='EARNED' AND r."availableForPayoutAt" <= now()
         ON CONFLICT ("creatorEarningId") DO NOTHING RETURNING *`,
        [earningId, userId],
      ) as Array<Record<string, unknown>>;
      if (!rows[0]) throw new ConflictException('Creator earning is unavailable, has no payout recipient, or was already requested');
      await manager.query(`UPDATE "creator_earnings" SET "status"='PENDING_PAYOUT' WHERE "id"=$1`, [earningId]);
      return rows[0];
    });
  }

  async approvePayout(actorUserId: string, payoutId: string) {
    this.assertPayoutsEnabled();
    const rows = await this.dataSource.query(
      `UPDATE "payout_requests" p SET "status"='APPROVED',"approvedByUserId"=$1,"updatedAt"=now()
       FROM "payout_recipients" r JOIN "user_eligibility" ue ON ue."userId"=r."userId"
       WHERE p."id"=$2 AND p."recipientId"=r."id" AND p."status"='PENDING_APPROVAL'
         AND ue."adultVerified"=true AND ue."paidCompetitionEligible"=true AND r."availableForPayoutAt" <= now()
       RETURNING p.*`,
      [actorUserId, payoutId],
    ) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new ConflictException('Payout is not pending approval');
    return rows[0];
  }

  async executePayout(actorUserId: string, payoutId: string) {
    this.assertPayoutsEnabled();
    const claimed = await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT p."id",p."status",p."approvedByUserId",COALESCE(a."amountKobo",e."amountKobo") "amountKobo",
                COALESCE(a."currency",e."currency") currency,r."providerRecipientCode",r."availableForPayoutAt"
         FROM "payout_requests" p
         LEFT JOIN "prize_awards" a ON a."id"=p."awardId"
         LEFT JOIN "creator_earnings" e ON e."id"=p."creatorEarningId"
         JOIN "payout_recipients" r ON r."id"=p."recipientId"
         JOIN "user_eligibility" ue ON ue."userId"=r."userId"
         WHERE p."id"=$1 AND ue."adultVerified"=true AND ue."paidCompetitionEligible"=true FOR UPDATE OF p`,
        [payoutId],
      ) as Array<{ id: string; status: string; approvedByUserId: string; amountKobo: string; currency: string; providerRecipientCode: string; availableForPayoutAt: Date }>;
      const payout = rows[0];
      if (!payout || payout.status !== 'APPROVED') throw new ConflictException('Payout is not approved');
      if (payout.approvedByUserId === actorUserId) throw new ForbiddenException('A second administrator must execute the payout');
      if (new Date(payout.availableForPayoutAt) > new Date()) throw new ConflictException('The payout recipient is in a security hold period');
      const reference = `payout-${randomUUID()}`;
      await manager.query(`INSERT INTO "payout_attempts" ("payoutRequestId","reference") VALUES ($1,$2)`, [payoutId, reference]);
      await manager.query(`UPDATE "payout_requests" SET "status"='PROCESSING',"updatedAt"=now() WHERE "id"=$1`, [payoutId]);
      await manager.query(`INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId") VALUES ($1,'PAYOUT_EXECUTION_CLAIMED','payout_request',$2)`, [actorUserId, payoutId]);
      return { ...payout, reference };
    });
    try {
      const transfer = await this.paystack.initiateTransfer({ source: 'balance', amount: Number(claimed.amountKobo), recipient: claimed.providerRecipientCode, reference: claimed.reference, reason: 'Jump challenge prize' });
      if (transfer.reference !== claimed.reference) throw new ServiceUnavailableException('Payment provider returned an unexpected transfer reference');
      await this.dataSource.query(
        `UPDATE "payout_attempts" SET "providerTransferCode"=$1,"status"=$2,"providerPayload"=$3,"updatedAt"=now() WHERE "reference"=$4`,
        [transfer.transfer_code, transfer.status.toUpperCase(), JSON.stringify(transfer), claimed.reference],
      );
      return { reference: claimed.reference, status: transfer.status };
    } catch (error) {
      await this.dataSource.query(`UPDATE "payout_attempts" SET "status"='RECONCILIATION_REQUIRED',"updatedAt"=now() WHERE "reference"=$1`, [claimed.reference]);
      throw error;
    }
  }

  async reconcile() {
    this.assertProviderEnabled();
    const runs = await this.dataSource.query(`INSERT INTO "reconciliation_runs" ("provider") VALUES ('paystack') RETURNING "id"`) as Array<{ id: string }>;
    const payments = await this.dataSource.query(`SELECT "reference" FROM "payment_intents" WHERE "status" IN ('PENDING','RECONCILIATION_REQUIRED') ORDER BY "createdAt" ASC LIMIT 100`) as Array<{ reference: string }>;
    const transfers = await this.dataSource.query(`SELECT "reference" FROM "payout_attempts" WHERE "status" IN ('INITIATED','PENDING','PROCESSING','RECONCILIATION_REQUIRED') ORDER BY "createdAt" ASC LIMIT 100`) as Array<{ reference: string }>;
    const paymentResults = await Promise.allSettled(payments.map(({ reference }) => this.verifyAndFulfill(reference)));
    const transferResults = await Promise.allSettled(transfers.map(async ({ reference }) => {
      const transfer = await this.paystack.verifyTransfer(reference);
      if (['success', 'failed', 'reversed'].includes(transfer.status)) await this.applyTransferEvent(reference, `transfer.${transfer.status}`);
    }));
    const summary = {
      paymentsChecked: payments.length,
      transfersChecked: transfers.length,
      failures: [...paymentResults, ...transferResults].filter((result) => result.status === 'rejected').length,
    };
    await this.dataSource.query(`UPDATE "reconciliation_runs" SET "status"=$1,"summary"=$2,"completedAt"=now() WHERE "id"=$3`, [summary.failures ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED', JSON.stringify(summary), runs[0].id]);
    return summary;
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
    } else if (inbox.eventType.startsWith('refund.')) {
      const data = inbox.payload.data as { id?: number; status?: string; transaction?: { reference?: string } } | undefined;
      if (data?.transaction?.reference) {
        await this.dataSource.transaction(async (manager) => {
          const succeeded = data.status === 'processed';
          await manager.query(
            `UPDATE "refund_requests" r SET "status"=$1,"providerRefundId"=COALESCE($2,"providerRefundId"),"updatedAt"=now()
             FROM "payment_intents" p WHERE p."id"=r."paymentIntentId" AND p."reference"=$3`,
            [succeeded ? 'SUCCEEDED' : 'PROCESSING', data.id ? String(data.id) : null, data.transaction?.reference],
          );
          if (succeeded) {
            await manager.query(
              `UPDATE "payment_intents" SET "status"='REFUNDED',"updatedAt"=now() WHERE "reference"=$1 AND "status"='REFUND_PENDING'`,
              [data.transaction?.reference],
            );
          }
        });
      }
    }
    await this.webhooks.update({ id: inbox.id }, { processedAt: new Date() });
  }

  private async verifyAndFulfill(reference: string) {
    const provider = await this.paystack.verifyTransaction(reference);
    const intent = await this.intents.findOne({ where: { reference } });
    if (!intent || provider.status !== 'success' || provider.reference !== intent.reference || provider.amount !== intent.amountKobo || provider.currency !== intent.currency) {
      if (intent) await this.intents.update({ id: intent.id }, { status: 'RECONCILIATION_REQUIRED', providerStatus: provider.status });
      return;
    }
    if (intent.purpose === 'WALLET_FUNDING') {
      await this.fulfillWalletFunding(intent, provider);
      return;
    }
    if (!intent.tableId) {
      await this.intents.update({ id: intent.id }, { status: 'RECONCILIATION_REQUIRED', providerStatus: provider.status });
      return;
    }
    const challengeId = intent.tableId;
    const needsRefund = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOneOrFail(PaymentIntent, { where: { id: intent.id }, lock: { mode: 'pessimistic_write' } });
      if (!['INITIATED', 'PENDING', 'RECONCILIATION_REQUIRED'].includes(locked.status)) return false;
      const table = await manager.findOneOrFail(CompetitionTable, { where: { id: challengeId }, lock: { mode: 'pessimistic_write' } });
      const count = await manager.count(TableRegistration, { where: { tableId: table.id } });
      const eligible = await manager.query(
        `SELECT 1 FROM "user_eligibility" WHERE "userId"=$1 AND "adultVerified"=true AND "paidCompetitionEligible"=true`,
        [locked.userId],
      ) as unknown[];
      const alreadyRegistered = await manager.exists(TableRegistration, { where: { tableId: table.id, userId: locked.userId } });
      if (table.status !== 'OPEN_FOR_ENTRY' || (table.capacity !== null && count >= table.capacity) ||
          table.creatorId === locked.userId || !eligible.length || alreadyRegistered) {
        locked.status = 'REFUND_PENDING';
        await manager.save(locked);
        await manager.query(`INSERT INTO "refund_requests" ("paymentIntentId","amountKobo","currency","reason") VALUES ($1,$2,$3,'Competition entry unavailable') ON CONFLICT DO NOTHING`, [locked.id, locked.amountKobo, locked.currency]);
        return true;
      }
      locked.status = 'SUCCEEDED'; locked.providerStatus = provider.status; locked.providerTransactionId = String(provider.id);
      await manager.save(locked);
      await manager.save(TableRegistration, manager.create(TableRegistration, { tableId: table.id, userId: locked.userId, paymentIntentId: locked.id }));
      await this.postEntryLedger(manager, locked);
      return false;
    });
    if (needsRefund) {
      const refund = await this.paystack.createRefund({ transaction: reference, amount: intent.amountKobo, currency: intent.currency, merchant_note: 'Automatic refund: competition unavailable' });
      await this.dataSource.query(`UPDATE "refund_requests" SET "status"=$1,"providerRefundId"=$2,"updatedAt"=now() WHERE "paymentIntentId"=$3`, [refund.status === 'processed' ? 'SUCCEEDED' : 'PROCESSING', String(refund.id), intent.id]);
    }
  }

  private async fulfillWalletFunding(intent: PaymentIntent, provider: { id: number; status: string }) {
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOneOrFail(PaymentIntent, { where: { id: intent.id }, lock: { mode: 'pessimistic_write' } });
      if (!['INITIATED', 'PENDING', 'RECONCILIATION_REQUIRED'].includes(locked.status)) return;
      const wallets = await manager.query(
        `INSERT INTO "wallets" ("userId") VALUES ($1) ON CONFLICT ("userId") DO UPDATE SET "userId"=EXCLUDED."userId" RETURNING "id","balanceKobo"`,
        [locked.userId],
      ) as Array<{ id: string; balanceKobo: string }>;
      const balanceAfter = Number(wallets[0].balanceKobo) + locked.amountKobo;
      await manager.query(`UPDATE "wallets" SET "balanceKobo"=$1,"updatedAt"=now() WHERE "id"=$2`, [balanceAfter, wallets[0].id]);
      await manager.query(
        `INSERT INTO "wallet_transactions" ("walletId","type","amountKobo","balanceAfterKobo","reference","description") VALUES ($1,'FUNDING',$2,$3,$4,'Wallet funding') ON CONFLICT ("reference") DO NOTHING`,
        [wallets[0].id, locked.amountKobo, balanceAfter, locked.reference],
      );
      locked.status = 'SUCCEEDED';
      locked.providerStatus = provider.status;
      locked.providerTransactionId = String(provider.id);
      await manager.save(locked);
      const journal = await manager.query(`INSERT INTO "ledger_journals" ("reference","description") VALUES ($1,'Verified wallet funding') ON CONFLICT ("reference") DO NOTHING RETURNING "id"`, [`payment:${locked.reference}`]) as Array<{ id: string }>;
      if (journal[0]) {
        await manager.query(`INSERT INTO "ledger_entries" ("journalId","accountId","currency","amountKobo") SELECT $1,"id",'NGN',CASE "code" WHEN 'processor_clearing' THEN $2 ELSE -$2 END FROM "ledger_accounts" WHERE "code" IN ('processor_clearing','wallet_liability')`, [journal[0].id, locked.amountKobo]);
      }
    });
  }

  private async applyTransferEvent(reference: string, eventType: string) {
    const status = eventType === 'transfer.success' ? 'SUCCEEDED' : eventType === 'transfer.reversed' ? 'REVERSED' : 'FAILED';
    await this.dataSource.transaction(async (manager) => {
      const attempts = await manager.query(`UPDATE "payout_attempts" SET "status"=$1,"updatedAt"=now() WHERE "reference"=$2 RETURNING "payoutRequestId"`, [status, reference]) as Array<{ payoutRequestId: string }>;
      if (!attempts[0]) return;
      await manager.query(`UPDATE "payout_requests" SET "status"=$1,"updatedAt"=now() WHERE "id"=$2`, [status, attempts[0].payoutRequestId]);
      await manager.query(
        `UPDATE "prize_awards" a SET "status"=$1 FROM "payout_requests" p WHERE p."awardId"=a."id" AND p."id"=$2`,
        [status === 'SUCCEEDED' ? 'PAID' : status, attempts[0].payoutRequestId],
      );
      await manager.query(
        `UPDATE "creator_earnings" e SET "status"=$1 FROM "payout_requests" p WHERE p."creatorEarningId"=e."id" AND p."id"=$2`,
        [status === 'SUCCEEDED' ? 'PAID' : status, attempts[0].payoutRequestId],
      );
    });
  }

  private async freezeDisputedFunds(reference: string, eventType: string) {
    await this.dataSource.transaction(async (manager) => {
      const intents = await manager.query(
        `UPDATE "payment_intents" SET "status"='DISPUTED',"providerStatus"=$1,"updatedAt"=now()
         WHERE "reference"=$2 AND "status" IN ('SUCCEEDED','DISPUTED') RETURNING "userId"`,
        [eventType, reference],
      ) as Array<{ userId: string }>;
      if (!intents[0]) return;
      await manager.query(
        `UPDATE "wallets" SET "frozenAt"=COALESCE("frozenAt",now()),"freezeReason"='PAYMENT_DISPUTE',"updatedAt"=now() WHERE "userId"=$1`,
        [intents[0].userId],
      );
      await manager.query(
        `INSERT INTO "user_eligibility" ("userId","paidCompetitionEligible") VALUES ($1,false)
         ON CONFLICT ("userId") DO UPDATE SET "paidCompetitionEligible"=false,"updatedAt"=now()`,
        [intents[0].userId],
      );
      await manager.query(
        `UPDATE "payout_requests" p SET "status"='SECURITY_HOLD',"updatedAt"=now()
         FROM "payout_recipients" r WHERE p."recipientId"=r."id" AND r."userId"=$1
           AND p."status" IN ('PENDING_APPROVAL','APPROVED')`,
        [intents[0].userId],
      );
    });
  }

  private async postEntryLedger(manager: import('typeorm').EntityManager, intent: PaymentIntent) {
    const journal = (await manager.query(`INSERT INTO "ledger_journals" ("reference","description") VALUES ($1,'Verified Paystack competition entry') ON CONFLICT ("reference") DO NOTHING RETURNING "id"`, [`payment:${intent.reference}`])) as Array<{ id: string }>;
    if (!journal[0]) return;
    await manager.query(`INSERT INTO "ledger_entries" ("journalId","accountId","currency","amountKobo") SELECT $1,"id",'NGN',CASE "code" WHEN 'processor_clearing' THEN $2 ELSE -$2 END FROM "ledger_accounts" WHERE "code" IN ('processor_clearing','contest_entry_liability')`, [journal[0].id, intent.amountKobo]);
  }

  private async postWalletEntryLedger(manager: import('typeorm').EntityManager, reference: string, amountKobo: number) {
    const journal = await manager.query(`INSERT INTO "ledger_journals" ("reference","description") VALUES ($1,'Wallet-funded challenge entry') ON CONFLICT ("reference") DO NOTHING RETURNING "id"`, [reference]) as Array<{ id: string }>;
    if (!journal[0]) return;
    await manager.query(`INSERT INTO "ledger_entries" ("journalId","accountId","currency","amountKobo") SELECT $1,"id",'NGN',CASE "code" WHEN 'wallet_liability' THEN $2 ELSE -$2 END FROM "ledger_accounts" WHERE "code" IN ('wallet_liability','contest_entry_liability')`, [journal[0].id, amountKobo]);
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
    const rows = await manager.query(
      `SELECT 1 FROM "user_eligibility" WHERE "userId"=$1 AND "adultVerified"=true AND "paidCompetitionEligible"=true`,
      [userId],
    ) as unknown[];
    if (!rows.length) throw new ForbiddenException('This account is not eligible for paid competitions');
  }
}
