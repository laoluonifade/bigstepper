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
import { assertCountryEligible } from '../tables/club-challenges';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentIntent) private readonly intents: Repository<PaymentIntent>,
    @InjectRepository(ProviderWebhook) private readonly webhooks: Repository<ProviderWebhook>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly paystack: PaystackClient,
    private readonly aml: AmlService,
  ) {}

  /** The return page is for navigation only; webhooks and verification still decide payment status. */
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
    if (!user.emailVerified) throw new ForbiddenException('Verify your email before funding a wallet');
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
      const count = Number((await manager.query(`SELECT COUNT(*)::integer count FROM "table_registrations" WHERE "tableId"=$1 AND "userId"<>$2`, [tableId, table.creatorId]) as Array<{ count: number }>)[0].count);
      if (table.capacity !== null && count >= table.capacity) throw new ConflictException('This competition is full');
      const wallets = await manager.query(`SELECT "id","balanceKobo","frozenAt" FROM "wallets" WHERE "userId"=$1 FOR UPDATE`, [userId]) as Array<{ id: string; balanceKobo: string; frozenAt: Date | null }>;
      const wallet = wallets[0];
      if (wallet?.frozenAt) throw new ForbiddenException('Wallet spending is temporarily restricted; contact support');
      if (!wallet || Number(wallet.balanceKobo) < table.entryFeeKobo) throw new ConflictException('Insufficient wallet balance');
      const balanceAfter = Number(wallet.balanceKobo) - table.entryFeeKobo;
      const reference = `jump-wallet-entry-${randomUUID()}`;
      await manager.query(`UPDATE "wallets" SET "balanceKobo"=$1,"updatedAt"=now() WHERE "id"=$2`, [balanceAfter, wallet.id]);
      await manager.query(
        `INSERT INTO "wallet_transactions" ("walletId","type","amountKobo","balanceAfterKobo","reference","description") VALUES ($1,'CHALLENGE_ENTRY',$2,$3,$4,'Paid competition entry')`,
        [wallet.id, -table.entryFeeKobo, balanceAfter, reference],
      );
      const registration = await manager.save(TableRegistration, manager.create(TableRegistration, { tableId, userId, paymentIntentId: null }));
      await creditActivities(manager, { tableId, userId });
      await manager.query(
        `UPDATE "challenge_invitations" SET "status"='ACCEPTED',"respondedAt"=now()
         WHERE "tableId"=$1 AND "invitedUserId"=$2 AND "status"='PENDING'`,
        [tableId, userId],
      );
      await this.postWalletEntryLedger(manager, reference, table.entryFeeKobo);
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
    return this.dataSource.query(`SELECT "id","tableId","place","grossPrizeKobo","platformFeeKobo","creatorCommissionKobo","amountKobo","currency","status","createdAt" FROM "prize_awards" WHERE "winnerUserId"=$1 ORDER BY "createdAt" DESC`, [userId]);
  }

  private bankCache: { at: number; banks: Array<{ code: string; name: string }> } | null = null;

  /** Live bank list from Paystack, so payouts never offer a bank that has closed. Cached for 12 hours. */
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

  /** Looks up the account holder's name so runners confirm it instead of typing it. */
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

  /**
   * Only used while KYC is switched off. With KYC on, the payout account is the bank account verified
   * with the runner's BVN (AmlService.submitKyc), so payouts never go to a third party's account.
   */
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
      const existing = await manager.query(`SELECT "id" FROM "payout_recipients" WHERE "userId"=$1 FOR UPDATE`, [userId]) as Array<{ id: string }>;
      const availableForPayoutAt = existing[0] ? new Date(Date.now() + 24 * 60 * 60 * 1000) : new Date();
      const rows = await manager.query(
        `INSERT INTO "payout_recipients" ("userId","providerRecipientCode","accountName","bankCode","accountLast4","availableForPayoutAt","accountHash","kycVerified") VALUES ($1,$2,$3,$4,$5,$6,$7,false)
         ON CONFLICT ("userId") DO UPDATE SET "providerRecipientCode"=EXCLUDED."providerRecipientCode","accountName"=EXCLUDED."accountName",
           "bankCode"=EXCLUDED."bankCode","accountLast4"=EXCLUDED."accountLast4","availableForPayoutAt"=EXCLUDED."availableForPayoutAt",
           "accountHash"=EXCLUDED."accountHash","kycVerified"=false,"updatedAt"=now()
         RETURNING "id","accountName","bankCode","accountLast4","currency","availableForPayoutAt"`,
        [userId, recipient.recipient_code, recipient.details.account_name, input.bankCode, input.accountNumber.slice(-4), availableForPayoutAt, this.aml.accountHash(input.bankCode, input.accountNumber)],
      ) as Array<Record<string, unknown>>;
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,$2,'payout_recipient',$3,$4)`,
        [userId, existing[0] ? 'PAYOUT_RECIPIENT_REPLACED' : 'PAYOUT_RECIPIENT_CREATED', rows[0].id, JSON.stringify({ accountLast4: input.accountNumber.slice(-4), availableForPayoutAt })],
      );
      if (existing[0]) {
        await manager.query(
          `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'PAYOUT_RECIPIENT_CHANGED','Payout account changed','Your payout account was changed. Payouts are paused for 24 hours; contact support immediately if this was not you.','/wallet')`,
          [userId],
        );
      }
      return rows[0];
    });
  }

  /**
   * Checks the withdrawal limits for the account's risk level first. Requests over the review threshold,
   * or from flagged, held or new accounts, are saved with a risk hold for a documented admin decision.
   */
  async requestPayout(userId: string, awardId: string) {
    this.assertPayoutsEnabled();
    await this.assertPaidEligibility(userId);
    return this.dataSource.transaction(async (manager) => {
      const [award] = await manager.query(`SELECT "amountKobo" FROM "prize_awards" WHERE "id"=$1 AND "winnerUserId"=$2 FOR UPDATE`, [awardId, userId]) as Array<{ amountKobo: string }>;
      if (!award) throw new NotFoundException('Award not found');
      const holdReasons = await this.aml.assessPayout(manager, userId, Number(award.amountKobo));
      const rows = await manager.query(
        `INSERT INTO "payout_requests" ("awardId","recipientId")
         SELECT a."id",r."id" FROM "prize_awards" a
         JOIN "payout_recipients" r ON r."userId"=a."winnerUserId"
         JOIN "competition_tables" t ON t."id"=a."tableId"
         WHERE a."id"=$1 AND a."winnerUserId"=$2 AND a."status"='PENDING_APPROVAL' AND r."availableForPayoutAt" <= now()
           AND (t."type"<>'sponsored' OR (
             EXISTS (SELECT 1 FROM "payment_intents" i WHERE i."tableId"=t."id" AND i."purpose"='SPONSOR_FUNDING' AND i."status"='SUCCEEDED')
             AND NOT EXISTS (SELECT 1 FROM "payment_intents" i WHERE i."tableId"=t."id" AND i."purpose"='SPONSOR_FUNDING' AND i."status"='DISPUTED')
           ))
         ON CONFLICT ("awardId") WHERE "status" <> 'REJECTED' DO NOTHING RETURNING *`, [awardId, userId],
      ) as Array<Record<string, unknown>>;
      if (!rows[0]) throw new ConflictException('Award is unavailable or a payout was already requested');
      await this.aml.holdPayout(manager, rows[0].id as string, userId, holdReasons);
      return { ...rows[0], riskHold: holdReasons.length > 0 };
    });
  }

  async requestCreatorPayout(userId: string, earningId: string) {
    this.assertPayoutsEnabled();
    await this.assertPaidEligibility(userId);
    return this.dataSource.transaction(async (manager) => {
      const [earning] = await manager.query(
        `SELECT e."amountKobo" FROM "creator_earnings" e JOIN "creator_profiles" c ON c."id"=e."creatorProfileId" WHERE e."id"=$1 AND c."userId"=$2 FOR UPDATE OF e`, [earningId, userId],
      ) as Array<{ amountKobo: string }>;
      if (!earning) throw new NotFoundException('Creator earning not found');
      const holdReasons = await this.aml.assessPayout(manager, userId, Number(earning.amountKobo));
      const rows = await manager.query(
        `INSERT INTO "payout_requests" ("creatorEarningId","recipientId")
         SELECT e."id",r."id" FROM "creator_earnings" e
         JOIN "creator_profiles" c ON c."id"=e."creatorProfileId"
         JOIN "payout_recipients" r ON r."userId"=c."userId"
         WHERE e."id"=$1 AND c."userId"=$2 AND e."status"='EARNED' AND r."availableForPayoutAt" <= now()
         ON CONFLICT ("creatorEarningId") WHERE "status" <> 'REJECTED' DO NOTHING RETURNING *`,
        [earningId, userId],
      ) as Array<Record<string, unknown>>;
      if (!rows[0]) throw new ConflictException('Creator earning is unavailable, has no payout recipient, or was already requested');
      await manager.query(`UPDATE "creator_earnings" SET "status"='PENDING_PAYOUT' WHERE "id"=$1`, [earningId]);
      await this.aml.holdPayout(manager, rows[0].id as string, userId, holdReasons);
      return { ...rows[0], riskHold: holdReasons.length > 0 };
    });
  }

  /** Payout requests for the admin review screen, oldest pending first. */
  listPayouts(view: 'pending' | 'history') {
    return this.dataSource.query(
      `SELECT p."id", p."status", p."createdAt", p."reviewedAt", p."rejectionReason",
              CASE WHEN p."awardId" IS NOT NULL THEN 'PRIZE' ELSE 'CREATOR' END "kind",
              COALESCE(a."amountKobo", e."amountKobo")::integer "amountKobo",
              COALESCE(at."title", et."title") "challengeTitle", COALESCE(at."code", et."code") "challengeCode",
              u."id" "userId", u."email", pr."displayName", pr."username", pr."avatarUrl",
              r."accountName", r."bankCode", r."accountLast4", r."availableForPayoutAt",
              (COALESCE(ue."paidCompetitionEligible" = false, false) OR
               (at."type"='sponsored' AND (
                 NOT EXISTS (SELECT 1 FROM "payment_intents" fi WHERE fi."tableId"=at."id" AND fi."purpose"='SPONSOR_FUNDING' AND fi."status"='SUCCEEDED') OR
                 EXISTS (SELECT 1 FROM "payment_intents" fi WHERE fi."tableId"=at."id" AND fi."purpose"='SPONSOR_FUNDING' AND fi."status"='DISPUTED')
               ))) "blocked",
              reviewer."displayName" "reviewedBy",
              p."riskHold", p."holdReasons", p."escalatedAt", p."decisionNote", r."kycVerified",
              COALESCE(ur."score", 0) "riskScore", COALESCE(ur."level", 'LOW') "riskLevel", COALESCE(ur."payoutHold", false) "accountHold",
              (SELECT count(*)::integer FROM "risk_flags" f WHERE f."status" IN ('OPEN','ESCALATED') AND (f."userId"=u."id" OR f."relatedUserIds" ? u."id"::text)) "openFlags",
              (SELECT pa."status" FROM "payout_attempts" pa WHERE pa."payoutRequestId" = p."id" ORDER BY pa."createdAt" DESC LIMIT 1) "transferStatus"
       FROM "payout_requests" p
       JOIN "payout_recipients" r ON r."id" = p."recipientId"
       JOIN "users" u ON u."id" = r."userId"
       LEFT JOIN "profiles" pr ON pr."userId" = u."id"
       LEFT JOIN "user_eligibility" ue ON ue."userId" = u."id"
       LEFT JOIN "prize_awards" a ON a."id" = p."awardId"
       LEFT JOIN "competition_tables" at ON at."id" = a."tableId"
       LEFT JOIN "creator_earnings" e ON e."id" = p."creatorEarningId"
       LEFT JOIN "competition_tables" et ON et."id" = e."tableId"
       LEFT JOIN "profiles" reviewer ON reviewer."userId" = p."approvedByUserId"
       LEFT JOIN "user_risk" ur ON ur."userId" = u."id"
       WHERE ($1 = 'pending') = (p."status" = 'PENDING_APPROVAL')
       ORDER BY CASE WHEN $1 = 'pending' THEN p."escalatedAt" IS NULL END, CASE WHEN $1 = 'pending' THEN p."createdAt" END ASC, p."updatedAt" DESC
       LIMIT 200`,
      [view],
    );
  }

  /**
   * Approving a payout sends it: one admin reviews the request and the Paystack transfer starts
   * straight away. Admins can't approve a payout to themselves. A payout held for risk needs a written
   * decision, and an account on a payout hold must be cleared first.
   */
  async approvePayout(actorUserId: string, payoutId: string, note?: string) {
    this.assertPayoutsEnabled();
    const claimed = await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT p."id", p."status", r."userId", COALESCE(a."amountKobo", e."amountKobo") "amountKobo",
                r."providerRecipientCode", r."availableForPayoutAt", p."riskHold", r."kycVerified",
                (COALESCE(ue."paidCompetitionEligible" = false, false) OR
                 (t."type"='sponsored' AND (
                   NOT EXISTS (SELECT 1 FROM "payment_intents" fi WHERE fi."tableId"=t."id" AND fi."purpose"='SPONSOR_FUNDING' AND fi."status"='SUCCEEDED') OR
                   EXISTS (SELECT 1 FROM "payment_intents" fi WHERE fi."tableId"=t."id" AND fi."purpose"='SPONSOR_FUNDING' AND fi."status"='DISPUTED')
                 ))) "blocked"
         FROM "payout_requests" p
         LEFT JOIN "prize_awards" a ON a."id" = p."awardId"
         LEFT JOIN "competition_tables" t ON t."id" = a."tableId"
         LEFT JOIN "creator_earnings" e ON e."id" = p."creatorEarningId"
         JOIN "payout_recipients" r ON r."id" = p."recipientId"
         LEFT JOIN "user_eligibility" ue ON ue."userId" = r."userId"
         WHERE p."id" = $1 FOR UPDATE OF p`,
        [payoutId],
      ) as Array<{ id: string; status: string; userId: string; amountKobo: string; providerRecipientCode: string; availableForPayoutAt: Date; blocked: boolean; riskHold: boolean; kycVerified: boolean }>;
      const payout = rows[0];
      if (!payout) throw new NotFoundException('Payout request not found');
      if (payout.status !== 'PENDING_APPROVAL') throw new ConflictException('This payout was already reviewed');
      if (payout.userId === actorUserId) throw new ForbiddenException('You can’t approve a payout to yourself');
      if (payout.blocked) throw new ConflictException('The recipient or competition funding is under a payment hold');
      if (new Date(payout.availableForPayoutAt) > new Date()) throw new ConflictException('Their bank details changed recently, so this payout is on a 24-hour security hold');
      await this.aml.assertApprovable(manager, payout, note);
      const reference = `payout-${randomUUID()}`;
      await manager.query(
        `UPDATE "payout_requests" SET "status"='PROCESSING',"approvedByUserId"=$1,"reviewedAt"=now(),"decisionNote"=COALESCE($3,"decisionNote"),"updatedAt"=now() WHERE "id"=$2`,
        [actorUserId, payoutId, note?.trim() || null],
      );
      await manager.query(`INSERT INTO "payout_attempts" ("payoutRequestId","reference") VALUES ($1,$2)`, [payoutId, reference]);
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,'PAYOUT_APPROVED','payout_request',$2,$3)`,
        [actorUserId, payoutId, JSON.stringify({ amountKobo: Number(payout.amountKobo), reference, userId: payout.userId, riskHold: payout.riskHold, note: note?.trim() || null })],
      );
      return { ...payout, reference };
    });
    try {
      const transfer = await this.paystack.initiateTransfer({ source: 'balance', amount: Number(claimed.amountKobo), recipient: claimed.providerRecipientCode, reference: claimed.reference, reason: 'Jump competition prize' });
      if (transfer.reference !== claimed.reference) throw new ServiceUnavailableException('Payment provider returned an unexpected transfer reference');
      await this.dataSource.query(
        `UPDATE "payout_attempts" SET "providerTransferCode"=$1,"status"=$2,"providerPayload"=$3,"updatedAt"=now() WHERE "reference"=$4`,
        [transfer.transfer_code, transfer.status.toUpperCase(), JSON.stringify(transfer), claimed.reference],
      );
      await this.dataSource.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'PAYOUT_SENT','Your payout is on its way',$2,'/wallet')`,
        [claimed.userId, `₦${(Number(claimed.amountKobo) / 100).toLocaleString('en-NG')} is being sent to your bank. It usually arrives within minutes.`],
      );
      return { reference: claimed.reference, status: transfer.status };
    } catch (error) {
      // The request stays PROCESSING; reconciliation checks Paystack and settles it either way.
      await this.dataSource.query(`UPDATE "payout_attempts" SET "status"='RECONCILIATION_REQUIRED',"updatedAt"=now() WHERE "reference"=$1`, [claimed.reference]);
      throw error;
    }
  }

  /** Turns a request down with a reason the runner sees; they can fix the issue and request again. */
  async rejectPayout(actorUserId: string, payoutId: string, reason: string) {
    return this.dataSource.transaction(async (manager) => {
      // TypeORM returns [rows, affected] for UPDATE ... RETURNING on Postgres.
      const [rows] = await manager.query(
        `UPDATE "payout_requests" p SET "status"='REJECTED',"rejectionReason"=$3,"decisionNote"=$3,"approvedByUserId"=$1,"reviewedAt"=now(),"updatedAt"=now()
         FROM "payout_recipients" r
         WHERE p."id"=$2 AND p."status"='PENDING_APPROVAL' AND r."id"=p."recipientId"
         RETURNING p."id", p."creatorEarningId", r."userId"`,
        [actorUserId, payoutId, reason],
      ) as [Array<{ id: string; creatorEarningId: string | null; userId: string }>, number];
      if (!rows[0]) throw new ConflictException('This payout was already reviewed');
      if (rows[0].creatorEarningId) await manager.query(`UPDATE "creator_earnings" SET "status"='EARNED' WHERE "id"=$1`, [rows[0].creatorEarningId]);
      await manager.query(
        `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,'PAYOUT_REJECTED','payout_request',$2,$3)`,
        [actorUserId, payoutId, JSON.stringify({ reason, userId: rows[0].userId })],
      );
      await manager.query(
        `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,'PAYOUT_REJECTED','Payout not approved',$2,'/wallet')`,
        [rows[0].userId, `${reason} You can request it again once that’s sorted.`],
      );
      return { id: rows[0].id, status: 'REJECTED' };
    });
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

  /** One bounded batch per minute. Verify first; never infer that an unconfirmed charge failed. */
  async sweepAbandonedCheckouts() {
    if (!this.config.get<boolean>('PAID_CONTESTS_ENABLED')) return { checked: 0, failures: 0 };
    this.assertProviderEnabled();
    const payments = await this.dataSource.query(
      `SELECT "reference" FROM "payment_intents"
       WHERE "status" IN ('INITIATED','PENDING') AND "createdAt" <= now() - interval '15 minutes'
         AND "updatedAt" <= now() - interval '5 minutes'
       ORDER BY "createdAt" ASC LIMIT 20`,
    ) as Array<{ reference: string }>;
    let next = 0;
    let failures = 0;
    await Promise.all(Array.from({ length: Math.min(5, payments.length) }, async () => {
      while (next < payments.length) {
        const { reference } = payments[next++];
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
    if (!intent) return;
    if (provider.reference !== intent.reference || provider.amount !== intent.amountKobo || provider.currency !== intent.currency) {
      if (!['SUCCEEDED', 'REFUNDED', 'DISPUTED'].includes(intent.status)) await this.intents.update({ id: intent.id }, { status: 'RECONCILIATION_REQUIRED', providerStatus: provider.status });
      return;
    }
    if (provider.status !== 'success') {
      const expired = intent.createdAt.getTime() <= Date.now() - 15 * 60 * 1000;
      const failed = expired && ['abandoned', 'failed'].includes(provider.status);
      const review = provider.status === 'reversed';
      await this.dataSource.query(
        `UPDATE "payment_intents" SET "status"=CASE WHEN $2 THEN 'FAILED' WHEN $3 THEN 'RECONCILIATION_REQUIRED' ELSE "status" END,"providerStatus"=$4,"updatedAt"=now()
         WHERE "id"=$1 AND "status" IN ('INITIATED','PENDING','RECONCILIATION_REQUIRED','FAILED')`,
        [intent.id, failed, review, provider.status],
      );
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
      const count = Number((await manager.query(`SELECT COUNT(*)::integer count FROM "table_registrations" WHERE "tableId"=$1 AND "userId"<>$2`, [table.id, table.creatorId]) as Array<{ count: number }>)[0].count);
      const blocked = await this.isPaidBlocked(locked.userId, manager);
      const alreadyRegistered = await manager.exists(TableRegistration, { where: { tableId: table.id, userId: locked.userId } });
      if (table.status !== 'OPEN_FOR_ENTRY' || (table.capacity !== null && count >= table.capacity) ||
          table.creatorId === locked.userId || blocked || alreadyRegistered) {
        locked.status = 'REFUND_PENDING';
        await manager.save(locked);
        await manager.query(`INSERT INTO "refund_requests" ("paymentIntentId","amountKobo","currency","reason") VALUES ($1,$2,$3,'Competition entry unavailable') ON CONFLICT DO NOTHING`, [locked.id, locked.amountKobo, locked.currency]);
        return true;
      }
      locked.status = 'SUCCEEDED'; locked.providerStatus = provider.status; locked.providerTransactionId = String(provider.id);
      await manager.save(locked);
      await manager.save(TableRegistration, manager.create(TableRegistration, { tableId: table.id, userId: locked.userId, paymentIntentId: locked.id }));
      await creditActivities(manager, { tableId: table.id, userId: locked.userId });
      await manager.query(
        `UPDATE "challenge_invitations" SET "status"='ACCEPTED',"respondedAt"=now()
         WHERE "tableId"=$1 AND "invitedUserId"=$2 AND "status"='PENDING'`,
        [table.id, locked.userId],
      );
      await this.postEntryLedger(manager, locked);
      return false;
    });
    if (needsRefund) {
      const refund = await this.paystack.createRefund({ transaction: reference, amount: intent.amountKobo, currency: intent.currency, merchant_note: 'Automatic refund: competition unavailable' });
      await this.dataSource.query(`UPDATE "refund_requests" SET "status"=$1,"providerRefundId"=$2,"updatedAt"=now() WHERE "paymentIntentId"=$3`, [refund.status === 'processed' ? 'SUCCEEDED' : 'PROCESSING', String(refund.id), intent.id]);
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
        await manager.query(`INSERT INTO "refund_requests" ("paymentIntentId","amountKobo","currency","reason") VALUES ($1,$2,$3,'Prize funding unavailable') ON CONFLICT DO NOTHING`, [locked.id, locked.amountKobo, locked.currency]);
        return true;
      }
      if (!legacyFixed) {
        const [total] = await manager.query(
          `SELECT COALESCE(SUM("amountKobo"),0)::bigint AS amount FROM "payment_intents" WHERE "tableId"=$1 AND "purpose"='SPONSOR_FUNDING' AND "status"='SUCCEEDED'`,
          [table.id],
        ) as Array<{ amount: string }>;
        if (Number(total.amount) + locked.amountKobo > 1_000_000_000) {
          locked.status = 'REFUND_PENDING';
          await manager.save(locked);
          await manager.query(`INSERT INTO "refund_requests" ("paymentIntentId","amountKobo","currency","reason") VALUES ($1,$2,$3,'Prize funding limit reached') ON CONFLICT DO NOTHING`, [locked.id, locked.amountKobo, locked.currency]);
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
      // A club's funded competition takes the club in once it opens.
      if (legacyFixed && table.communityId) await enrolClubMembers(manager, { tableId: table.id });
      const journal = await manager.query(`INSERT INTO "ledger_journals" ("reference","description") VALUES ($1,'Verified funded competition prize') ON CONFLICT ("reference") DO NOTHING RETURNING "id"`, [`payment:${locked.reference}`]) as Array<{ id: string }>;
      if (journal[0]) await manager.query(`INSERT INTO "ledger_entries" ("journalId","accountId","currency","amountKobo") SELECT $1,"id",'NGN',CASE "code" WHEN 'processor_clearing' THEN $2::bigint ELSE -($2::bigint) END FROM "ledger_accounts" WHERE "code" IN ('processor_clearing','sponsor_prize_liability')`, [journal[0].id, locked.amountKobo]);
      return false;
    });
    if (needsRefund) {
      const refund = await this.paystack.createRefund({ transaction: intent.reference, amount: intent.amountKobo, currency: intent.currency, merchant_note: 'Automatic refund: prize funding unavailable' });
      await this.dataSource.query(`UPDATE "refund_requests" SET "status"=$1,"providerRefundId"=$2,"updatedAt"=now() WHERE "paymentIntentId"=$3`, [refund.status === 'processed' ? 'SUCCEEDED' : 'PROCESSING', String(refund.id), intent.id]);
    }
  }

  private async fulfillWalletFunding(intent: PaymentIntent, provider: { id: number; status: string }) {
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOneOrFail(PaymentIntent, { where: { id: intent.id }, lock: { mode: 'pessimistic_write' } });
      if (!['INITIATED', 'PENDING', 'RECONCILIATION_REQUIRED', 'FAILED'].includes(locked.status)) return;
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
        await manager.query(`INSERT INTO "ledger_entries" ("journalId","accountId","currency","amountKobo") SELECT $1,"id",'NGN',CASE "code" WHEN 'processor_clearing' THEN $2::bigint ELSE -($2::bigint) END FROM "ledger_accounts" WHERE "code" IN ('processor_clearing','wallet_liability')`, [journal[0].id, locked.amountKobo]);
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
    await manager.query(`INSERT INTO "ledger_entries" ("journalId","accountId","currency","amountKobo") SELECT $1,"id",'NGN',CASE "code" WHEN 'processor_clearing' THEN $2::bigint ELSE -($2::bigint) END FROM "ledger_accounts" WHERE "code" IN ('processor_clearing','contest_entry_liability')`, [journal[0].id, intent.amountKobo]);
  }

  private async postWalletEntryLedger(manager: import('typeorm').EntityManager, reference: string, amountKobo: number) {
    const journal = await manager.query(`INSERT INTO "ledger_journals" ("reference","description") VALUES ($1,'Wallet-funded competition entry') ON CONFLICT ("reference") DO NOTHING RETURNING "id"`, [reference]) as Array<{ id: string }>;
    if (!journal[0]) return;
    await manager.query(`INSERT INTO "ledger_entries" ("journalId","accountId","currency","amountKobo") SELECT $1,"id",'NGN',CASE "code" WHEN 'wallet_liability' THEN $2::bigint ELSE -($2::bigint) END FROM "ledger_accounts" WHERE "code" IN ('wallet_liability','contest_entry_liability')`, [journal[0].id, amountKobo]);
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

  /**
   * Paid challenges, funding and payouts need KYC Level 2 (when switched on in the AML settings). The
   * freeze put on an account after a payment dispute (paidCompetitionEligible=false) also blocks them.
   */
  private async assertPaidEligibility(userId: string, manager: import('typeorm').EntityManager = this.dataSource.manager) {
    if (await this.isPaidBlocked(userId, manager)) throw new ForbiddenException('Paid features are paused on this account after a payment dispute. Contact support.');
    await this.aml.assertVerified(userId, manager);
  }

  private async isPaidBlocked(userId: string, manager: import('typeorm').EntityManager = this.dataSource.manager) {
    const rows = await manager.query(`SELECT 1 FROM "user_eligibility" WHERE "userId"=$1 AND "paidCompetitionEligible"=false`, [userId]) as unknown[];
    return rows.length > 0;
  }
}
