import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHmac } from 'node:crypto';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { PaystackClient } from '../payments/paystack.client';
import { User } from '../users/user.entity';
import { AML_DEFAULTS, AmlSettings, mergeSettings, minEntrantsFor, RiskLevel, SEVERITY_POINTS } from './aml-settings';
import { SubmitKycDto } from './aml.dto';

export interface NewFlag {
  rule: string;
  severity: 1 | 2 | 3;
  userId: string;
  relatedUserIds?: string[];
  tableId?: string | null;
  payoutRequestId?: string | null;
  reason: string;
  evidence?: Record<string, unknown>;
  fingerprint: string;
  status?: 'OPEN' | 'ESCALATED';
}

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;
const isDuplicate = (error: unknown) =>
  error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505';
const words = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((word) => word.length > 1);

@Injectable()
export class AmlService {
  private readonly logger = new Logger(AmlService.name);
  private cache: { at: number; settings: AmlSettings } | null = null;

  constructor(private readonly dataSource: DataSource, private readonly config: ConfigService, private readonly paystack: PaystackClient) {}

  async settings(): Promise<AmlSettings> {
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache.settings;
    const [row] = await this.dataSource.query(`SELECT "values" FROM "aml_settings" WHERE "id" = 1`) as Array<{ values: Partial<AmlSettings> }>;
    const settings = mergeSettings(row?.values);
    this.cache = { at: Date.now(), settings };
    return settings;
  }

  async updateSettings(actorUserId: string, values: Record<string, unknown>) {
    const before = await this.settings();
    const next: Record<string, unknown> = { ...before };
    for (const [key, value] of Object.entries(values)) {
      const fallback = (AML_DEFAULTS as unknown as Record<string, unknown>)[key];
      if (fallback === undefined) throw new BadRequestException(`Unknown setting: ${key}`);
      if (key === 'participantTiers') {
        if (!Array.isArray(value) || !value.length || value.some((tier) => !isCount(tier?.potKobo) || !isCount(tier?.minEntrants) || tier.minEntrants < 2)) {
          throw new BadRequestException('Each participant tier needs a pot and at least 2 entrants');
        }
        next[key] = value.map((tier) => ({ potKobo: tier.potKobo, minEntrants: tier.minEntrants }));
      } else if (key === 'withdrawalLimits') {
        const limits = value as Record<string, { dailyKobo?: unknown; monthlyKobo?: unknown }>;
        for (const level of ['LOW', 'MEDIUM', 'HIGH'] as const) {
          if (!limits?.[level] || !isCount(limits[level].dailyKobo) || !isCount(limits[level].monthlyKobo)) throw new BadRequestException(`Set daily and monthly limits for ${level} risk`);
        }
        next[key] = { LOW: limits.LOW, MEDIUM: limits.MEDIUM, HIGH: limits.HIGH };
      } else if (typeof fallback === 'boolean') {
        if (typeof value !== 'boolean') throw new BadRequestException(`${key} must be on or off`);
        next[key] = value;
      } else {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (key !== 'spikeMultiplier' && !Number.isInteger(value))) {
          throw new BadRequestException(`${key} must be a whole number of zero or more`);
        }
        next[key] = value;
      }
    }
    const merged = mergeSettings(next as Partial<AmlSettings>);
    if (merged.riskMediumScore >= merged.riskHighScore || merged.riskHighScore > 100) throw new BadRequestException('The medium risk score must be below the high risk score, which is at most 100');
    const changed = Object.keys(values).filter((key) => JSON.stringify((before as unknown as Record<string, unknown>)[key]) !== JSON.stringify((merged as unknown as Record<string, unknown>)[key]));
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`UPDATE "aml_settings" SET "values" = $1, "updatedByUserId" = $2, "updatedAt" = now() WHERE "id" = 1`, [JSON.stringify(merged), actorUserId]);
      await this.audit(manager, actorUserId, 'AML_SETTINGS_UPDATED', 'aml_settings', '1', {
        changes: Object.fromEntries(changed.map((key) => [key, { from: (before as unknown as Record<string, unknown>)[key], to: (merged as unknown as Record<string, unknown>)[key] }])),
      });
    });
    this.cache = null;
    return merged;
  }

  private hash(value: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('KYC_HASH_SECRET')).update(value).digest('hex');
  }

  accountHash(bankCode: string, accountNumber: string) {
    return this.hash(`acct:${bankCode}:${accountNumber}`);
  }

  async kycStatus(userId: string) {
    const settings = await this.settings();
    const [row] = await this.dataSource.query(
      `SELECT "level","status","firstName","lastName","accountName","bankCode","accountLast4","bvnLast4","failureReason","submittedAt","verifiedAt"
       FROM "kyc_verifications" WHERE "userId" = $1`, [userId],
    ) as Array<Record<string, unknown>>;
    return { required: settings.kycRequired, ...(row ?? { level: 0, status: 'NONE' }) };
  }

  async submitKyc(userId: string, input: SubmitKycDto) {
    const user = await this.dataSource.getRepository(User).createQueryBuilder('user').addSelect('user.passwordHash').where('user.id = :userId', { userId }).getOne();
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new ForbiddenException('Password confirmation failed');
    if (!user.emailVerified) throw new ForbiddenException('Verify your email first');
    const [current] = await this.dataSource.query(`SELECT "status","submittedAt" FROM "kyc_verifications" WHERE "userId" = $1`, [userId]) as Array<{ status: string; submittedAt: Date | null }>;
    if (current?.status === 'PENDING' && current.submittedAt && new Date(current.submittedAt).getTime() > Date.now() - 10 * 60_000) {
      throw new ConflictException('We’re still checking your last submission. This usually takes a few minutes.');
    }

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const bvnHash = this.hash(`bvn:${input.bvn}`);
    const accountHash = this.accountHash(input.bankCode, input.accountNumber);

    const [bvnOwner] = await this.dataSource.query(
      `SELECT "userId" FROM "kyc_verifications" WHERE "bvnHash" = $1 AND "userId" <> $2 AND "status" IN ('VERIFIED','PENDING') LIMIT 1`, [bvnHash, userId],
    ) as Array<{ userId: string }>;
    if (bvnOwner) {
      await this.raiseFlag({
        rule: 'SHARED_BVN', severity: 3, userId, relatedUserIds: [bvnOwner.userId],
        reason: 'Tried to verify with a BVN that is already linked to another Jump account',
        fingerprint: `SHARED_BVN:${bvnHash.slice(0, 24)}:${userId}`,
      });
      throw new ConflictException('This BVN is already linked to another Jump account. Each person can have one account for paid competitions. Contact support if this is a mistake.');
    }
    const [accountOwner] = await this.dataSource.query(
      `SELECT "userId" FROM "kyc_verifications" WHERE "accountHash" = $1 AND "userId" <> $2 AND "status" IN ('VERIFIED','PENDING')
       UNION SELECT "userId" FROM "payout_recipients" WHERE "accountHash" = $1 AND "userId" <> $2 LIMIT 1`, [accountHash, userId],
    ) as Array<{ userId: string }>;
    if (accountOwner) {
      await this.raiseFlag({
        rule: 'SHARED_BANK_ACCOUNT', severity: 3, userId, relatedUserIds: [accountOwner.userId],
        reason: 'Tried to verify with a bank account already used by another Jump account',
        fingerprint: `SHARED_BANK_ACCOUNT:${accountHash.slice(0, 24)}:${userId}`,
      });
      throw new ConflictException('This bank account is already used by another Jump account. Use an account in your own name.');
    }

    let accountName: string;
    try {
      accountName = (await this.paystack.resolveAccount(input.accountNumber, input.bankCode)).account_name;
    } catch {
      throw new BadRequestException('We couldn’t find that account number at your bank. Check it and try again.');
    }
    if (!namesMatch(firstName, lastName, accountName)) {
      throw new BadRequestException(`The account must be in your own name. Your bank has it as “${accountName}”. Enter your names as they appear on your BVN and bank account.`);
    }
    const recipient = await this.paystack.createRecipient({ type: 'nuban', name: accountName, account_number: input.accountNumber, bank_code: input.bankCode, currency: 'NGN' });

    const sandbox = this.config.get<boolean>('KYC_SANDBOX_AUTOVERIFY');
    let customerCode: string | null = null;
    if (!sandbox) {
      customerCode = (await this.paystack.createCustomer({ email: user.email, first_name: firstName, last_name: lastName })).customer_code;
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO "kyc_verifications" ("userId","level","status","providerCustomerCode","firstName","lastName","bvnHash","bvnLast4","bankCode","accountHash","accountLast4","accountName","recipientCode","failureReason","submittedAt","verifiedAt","updatedAt")
         VALUES ($1,0,'PENDING',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,now(),NULL,now())
         ON CONFLICT ("userId") DO UPDATE SET "level"=0,"status"='PENDING',"providerCustomerCode"=EXCLUDED."providerCustomerCode","firstName"=EXCLUDED."firstName",
           "lastName"=EXCLUDED."lastName","bvnHash"=EXCLUDED."bvnHash","bvnLast4"=EXCLUDED."bvnLast4","bankCode"=EXCLUDED."bankCode","accountHash"=EXCLUDED."accountHash",
           "accountLast4"=EXCLUDED."accountLast4","accountName"=EXCLUDED."accountName","recipientCode"=EXCLUDED."recipientCode","failureReason"=NULL,
           "submittedAt"=now(),"verifiedAt"=NULL,"updatedAt"=now()`,
        [userId, customerCode, firstName, lastName, bvnHash, input.bvn.slice(-4), input.bankCode, accountHash, input.accountNumber.slice(-4), accountName, recipient.recipient_code],
      );
      await this.audit(manager, userId, 'KYC_SUBMITTED', 'user', userId, { bankCode: input.bankCode, accountLast4: input.accountNumber.slice(-4), bvnLast4: input.bvn.slice(-4) });
    });
    if (sandbox) {
      await this.markVerified(userId);
    } else {
      try {
        await this.paystack.validateCustomer(customerCode!, {
          country: 'NG', type: 'bank_account', account_number: input.accountNumber, bvn: input.bvn, bank_code: input.bankCode, first_name: firstName, last_name: lastName,
        });
      } catch (error) {
        await this.dataSource.query(`UPDATE "kyc_verifications" SET "status"='FAILED',"failureReason"=$2,"updatedAt"=now() WHERE "userId"=$1`,
          [userId, error instanceof Error ? error.message.slice(0, 300) : 'Identity check could not start']);
        throw new BadRequestException('We couldn’t start the identity check. Check your details and try again.');
      }
    }
    return this.kycStatus(userId);
  }

  async applyIdentificationEvent(eventType: string, data: { customer_code?: string; reason?: string } | undefined) {
    if (!data?.customer_code) return;
    const [row] = await this.dataSource.query(
      `SELECT "userId" FROM "kyc_verifications" WHERE "providerCustomerCode" = $1 AND "status" = 'PENDING'`, [data.customer_code],
    ) as Array<{ userId: string }>;
    if (!row) return;
    if (eventType === 'customeridentification.success') {
      await this.markVerified(row.userId);
      return;
    }
    const reason = (data.reason || 'The BVN and bank account details didn’t match').slice(0, 300);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`UPDATE "kyc_verifications" SET "status"='FAILED',"failureReason"=$2,"updatedAt"=now() WHERE "userId"=$1`, [row.userId, reason]);
      await this.audit(manager, null, 'KYC_FAILED', 'user', row.userId, { reason });
      await this.notify(manager, row.userId, 'KYC_FAILED', 'Identity check didn’t pass', `${reason}. Check your details match your BVN and try again under You → Identity verification.`);
    });
  }

  private async markVerified(userId: string) {
    try {
      await this.dataSource.transaction(async (manager) => {
        const [rows] = await manager.query(
          `UPDATE "kyc_verifications" SET "status"='VERIFIED',"level"=2,"verifiedAt"=now(),"failureReason"=NULL,"updatedAt"=now()
           WHERE "userId"=$1 RETURNING "recipientCode","accountName","bankCode","accountLast4","accountHash"`, [userId],
        ) as [Array<{ recipientCode: string; accountName: string; bankCode: string; accountLast4: string; accountHash: string }>, number];
        const verified = rows[0];
        if (!verified) return;
        const [existing] = await manager.query(`SELECT "accountHash","providerRecipientCode" FROM "payout_recipients" WHERE "userId"=$1 FOR UPDATE`, [userId]) as Array<{ accountHash: string | null; providerRecipientCode: string }>;
        const changed = existing && existing.providerRecipientCode !== verified.recipientCode;
        await manager.query(
          `INSERT INTO "payout_recipients" ("userId","providerRecipientCode","accountName","bankCode","accountLast4","accountHash","kycVerified","availableForPayoutAt")
           VALUES ($1,$2,$3,$4,$5,$6,true,$7)
           ON CONFLICT ("userId") DO UPDATE SET "providerRecipientCode"=EXCLUDED."providerRecipientCode","accountName"=EXCLUDED."accountName","bankCode"=EXCLUDED."bankCode",
             "accountLast4"=EXCLUDED."accountLast4","accountHash"=EXCLUDED."accountHash","kycVerified"=true,
             "availableForPayoutAt"=GREATEST("payout_recipients"."availableForPayoutAt",EXCLUDED."availableForPayoutAt"),"updatedAt"=now()`,
          [userId, verified.recipientCode, verified.accountName, verified.bankCode, verified.accountLast4, verified.accountHash,
            changed ? new Date(Date.now() + 24 * 60 * 60 * 1000) : new Date()],
        );
        await this.audit(manager, null, 'KYC_VERIFIED', 'user', userId, { accountLast4: verified.accountLast4, payoutAccountChanged: Boolean(changed) });
        await this.notify(manager, userId, 'KYC_VERIFIED', 'You’re verified',
          changed ? `Payouts now go to ${verified.accountName} (••${verified.accountLast4}). As your payout account changed, payouts pause for 24 hours.`
            : `Payouts go to ${verified.accountName} (••${verified.accountLast4}). You can now join paid competitions and request payouts.`);
      });
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      await this.dataSource.query(`UPDATE "kyc_verifications" SET "status"='FAILED',"failureReason"='These details are linked to another Jump account',"updatedAt"=now() WHERE "userId"=$1`, [userId]);
    }
  }

  async isVerified(userId: string, manager: EntityManager = this.dataSource.manager) {
    if (!(await this.settings()).kycRequired) return true;
    const rows = await manager.query(`SELECT 1 FROM "kyc_verifications" WHERE "userId"=$1 AND "status"='VERIFIED' AND "level">=2`, [userId]) as unknown[];
    return rows.length > 0;
  }

  async assertVerified(userId: string, manager: EntityManager = this.dataSource.manager) {
    if (!(await this.isVerified(userId, manager))) {
      throw new ForbiddenException({ statusCode: 403, code: 'KYC_REQUIRED', message: 'Verify your identity to use paid competitions and payouts. It takes a couple of minutes under You → Identity verification.' });
    }
  }

  async assertPaidChallengeLimits(userId: string, input: { entryFeeKobo: number; potKobo: number; capacity: number; minimumEntrants?: number }) {
    const settings = await this.settings();
    if (input.entryFeeKobo > settings.maxEntryFeeKobo) throw new BadRequestException(`The entry fee can be at most ${naira(settings.maxEntryFeeKobo)}`);
    if (input.potKobo > settings.maxPotKobo) throw new BadRequestException(`The prize pot can be at most ${naira(settings.maxPotKobo)}`);
    const [today] = await this.dataSource.query(
      `SELECT count(*)::integer count FROM "competition_tables" WHERE "creatorId"=$1 AND "type"='paid' AND "createdAt" >= now() - interval '24 hours'`, [userId],
    ) as Array<{ count: number }>;
    if (today.count >= settings.maxPaidChallengesPerDay) throw new ConflictException(`You can create up to ${settings.maxPaidChallengesPerDay} paid competitions a day. Try again tomorrow.`);
    const required = minEntrantsFor(settings, input.potKobo);
    if (required > input.capacity) throw new BadRequestException(`A ${naira(input.potKobo)} prize pot needs room for at least ${required} entrants`);
    return Math.max(input.minimumEntrants ?? 2, required);
  }

  async assertWalletFunding(userId: string, amountKobo: number) {
    const settings = await this.settings();
    const [row] = await this.dataSource.query(
      `SELECT COALESCE(sum("amountKobo"),0)::bigint total FROM "payment_intents"
       WHERE "userId"=$1 AND "purpose"='WALLET_FUNDING' AND "status" IN ('SUCCEEDED','PENDING','INITIATED') AND "createdAt" >= now() - interval '24 hours'`, [userId],
    ) as Array<{ total: string }>;
    if (Number(row.total) + amountKobo > settings.maxWalletFundingPerDayKobo) {
      throw new ConflictException(`You can add up to ${naira(settings.maxWalletFundingPerDayKobo)} a day in entry credit`);
    }
  }

  async assertPrizeFunding(amountKobo: number) {
    const settings = await this.settings();
    if (amountKobo > settings.maxPotKobo) throw new BadRequestException(`A contribution can be at most ${naira(settings.maxPotKobo)}`);
  }

  async assessPayout(manager: EntityManager, userId: string, amountKobo: number) {
    const settings = await this.settings();
    const [recipient] = await manager.query(`SELECT "kycVerified" FROM "payout_recipients" WHERE "userId"=$1`, [userId]) as Array<{ kycVerified: boolean }>;
    if (settings.kycRequired && !recipient?.kycVerified) {
      throw new ForbiddenException({ statusCode: 403, code: 'KYC_REQUIRED', message: 'Payouts only go to the bank account you verified. Verify your identity first, under You → Identity verification.' });
    }
    const risk = await this.riskOf(userId, manager);
    const limits = settings.withdrawalLimits[risk.level];
    const [used] = await manager.query(
      `SELECT COALESCE(sum(COALESCE(a."amountKobo", e."amountKobo")) FILTER (WHERE p."createdAt" >= now() - interval '24 hours'),0)::bigint day,
              COALESCE(sum(COALESCE(a."amountKobo", e."amountKobo")),0)::bigint month
       FROM "payout_requests" p JOIN "payout_recipients" r ON r."id"=p."recipientId"
       LEFT JOIN "prize_awards" a ON a."id"=p."awardId" LEFT JOIN "creator_earnings" e ON e."id"=p."creatorEarningId"
       WHERE r."userId"=$1 AND p."status" NOT IN ('REJECTED','FAILED','REVERSED') AND p."createdAt" >= now() - interval '30 days'`, [userId],
    ) as Array<{ day: string; month: string }>;
    if (limits.dailyKobo === 0 || limits.monthlyKobo === 0) throw new ForbiddenException('Payouts are paused on this account while we review it. Contact support if you think this is wrong.');
    if (Number(used.day) + amountKobo > limits.dailyKobo) throw new ConflictException(`This would pass your daily payout limit of ${naira(limits.dailyKobo)}. Try again tomorrow.`);
    if (Number(used.month) + amountKobo > limits.monthlyKobo) throw new ConflictException(`This would pass your 30-day payout limit of ${naira(limits.monthlyKobo)}.`);

    const reasons: string[] = [];
    if (amountKobo >= settings.payoutReviewThresholdKobo) reasons.push(`${naira(amountKobo)} is at or above the ${naira(settings.payoutReviewThresholdKobo)} review threshold`);
    if (risk.payoutHold) reasons.push(`Account is on a payout hold: ${risk.holdReason ?? 'under review'}`);
    if (risk.level !== 'LOW') reasons.push(`${risk.level === 'HIGH' ? 'High' : 'Medium'} risk account (score ${risk.score})`);
    if (risk.openFlags > 0) reasons.push(`${risk.openFlags} open risk flag${risk.openFlags === 1 ? '' : 's'}`);
    const [age] = await manager.query(
      `SELECT u."createdAt" < now() - make_interval(days => $2) "oldAccount", COALESCE(k."verifiedAt" < now() - make_interval(days => $2), true) "oldKyc"
       FROM "users" u LEFT JOIN "kyc_verifications" k ON k."userId"=u."id" WHERE u."id"=$1`, [userId, settings.newAccountDays],
    ) as Array<{ oldAccount: boolean; oldKyc: boolean }>;
    if (!age?.oldAccount) reasons.push(`Account is less than ${settings.newAccountDays} days old`);
    else if (!age.oldKyc) reasons.push(`Identity was verified less than ${settings.newAccountDays} days ago`);
    return reasons;
  }

  async holdPayout(manager: EntityManager, payoutRequestId: string, userId: string, reasons: string[]) {
    if (!reasons.length) return;
    await manager.query(`UPDATE "payout_requests" SET "riskHold"=true,"holdReasons"=$2 WHERE "id"=$1`, [payoutRequestId, JSON.stringify(reasons)]);
    await this.audit(manager, null, 'PAYOUT_HELD_FOR_REVIEW', 'payout_request', payoutRequestId, { userId, reasons });
  }

  async assertApprovable(manager: EntityManager, payout: { userId: string; riskHold: boolean; kycVerified: boolean }, note: string | undefined) {
    const settings = await this.settings();
    if (settings.kycRequired && !payout.kycVerified) throw new ConflictException('The payout account isn’t the runner’s verified account. They need to verify again.');
    const risk = await this.riskOf(payout.userId, manager);
    if (risk.payoutHold) throw new ConflictException('This account is on a payout hold. Review its risk profile and release the hold before sending.');
    if (payout.riskHold && (note?.trim().length ?? 0) < 10) throw new BadRequestException('This payout was held for review. Record why you’re approving it (at least 10 characters).');
  }

  async escalatePayout(actorUserId: string, payoutId: string, note: string) {
    return this.dataSource.transaction(async (manager) => {
      const [rows] = await manager.query(
        `UPDATE "payout_requests" p SET "escalatedAt"=now(),"escalatedByUserId"=$2,"decisionNote"=$3,"riskHold"=true,"updatedAt"=now()
         FROM "payout_recipients" r WHERE p."id"=$1 AND p."status"='PENDING_APPROVAL' AND r."id"=p."recipientId" RETURNING p."id", r."userId"`,
        [payoutId, actorUserId, note.trim()],
      ) as [Array<{ id: string; userId: string }>, number];
      if (!rows[0]) throw new ConflictException('Only payouts waiting for review can be escalated');
      await this.setHoldInTx(manager, rows[0].userId, true, `Payout escalated for investigation: ${note.trim()}`.slice(0, 300), 'admin');
      await manager.query(`UPDATE "risk_flags" SET "status"='ESCALATED',"reviewedByUserId"=$2,"reviewNote"=$3,"reviewedAt"=now()
                           WHERE "status"='OPEN' AND ("userId"::text=$1 OR "relatedUserIds" ? $1)`, [rows[0].userId, actorUserId, `Escalated with payout: ${note.trim()}`]);
      await this.audit(manager, actorUserId, 'PAYOUT_ESCALATED', 'payout_request', payoutId, { userId: rows[0].userId, note: note.trim() });
      return { id: payoutId, escalated: true };
    });
  }

  async riskOf(userId: string, manager: EntityManager = this.dataSource.manager) {
    const [row] = await manager.query(
      `SELECT r."score", r."level", r."payoutHold", r."holdReason",
              (SELECT count(*)::integer FROM "risk_flags" f WHERE f."status" IN ('OPEN','ESCALATED') AND (f."userId"::text=$1 OR f."relatedUserIds" ? $1)) "openFlags"
       FROM (SELECT $1::text::uuid "userId") x LEFT JOIN "user_risk" r ON r."userId"=x."userId"`, [userId],
    ) as Array<{ score: number | null; level: RiskLevel | null; payoutHold: boolean | null; holdReason: string | null; openFlags: number }>;
    return { score: row?.score ?? 0, level: (row?.level ?? 'LOW') as RiskLevel, payoutHold: row?.payoutHold ?? false, holdReason: row?.holdReason ?? null, openFlags: row?.openFlags ?? 0 };
  }

  async raiseFlag(flag: NewFlag) {
    const [row] = await this.dataSource.query(
      `INSERT INTO "risk_flags" ("rule","severity","userId","relatedUserIds","tableId","payoutRequestId","reason","evidence","fingerprint","status")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT ("fingerprint") DO NOTHING RETURNING "id"`,
      [flag.rule, flag.severity, flag.userId, JSON.stringify([...new Set(flag.relatedUserIds ?? [])].filter((id) => id !== flag.userId)), flag.tableId ?? null,
        flag.payoutRequestId ?? null, flag.reason.slice(0, 400), JSON.stringify(flag.evidence ?? {}), flag.fingerprint.slice(0, 200), flag.status ?? 'OPEN'],
    ) as Array<{ id: string }>;
    if (!row) return null;
    await this.recomputeRisk([flag.userId, ...(flag.relatedUserIds ?? [])]);
    return row.id;
  }

  async recomputeRisk(userIds: string[]) {
    const settings = await this.settings();
    for (const userId of [...new Set(userIds)]) {
      const flags = await this.dataSource.query(
        `SELECT "severity","status","createdAt", "userId"::text=$1 AS "primary" FROM "risk_flags"
         WHERE "status" IN ('OPEN','ESCALATED','CONFIRMED') AND ("userId"::text=$1 OR "relatedUserIds" ? $1)`, [userId],
      ) as Array<{ severity: number; status: string; createdAt: Date; primary: boolean }>;
      const score = Math.min(100, Math.round(flags.reduce((sum, flag) => sum + (SEVERITY_POINTS[flag.severity] ?? 0) * (flag.primary ? 1 : 0.5) * (flag.status === 'ESCALATED' ? 1.5 : 1), 0)));
      const level: RiskLevel = score >= settings.riskHighScore ? 'HIGH' : score >= settings.riskMediumScore ? 'MEDIUM' : 'LOW';
      const [current] = await this.dataSource.query(`SELECT "payoutHold","holdReleasedAt" FROM "user_risk" WHERE "userId"=$1`, [userId]) as Array<{ payoutHold: boolean; holdReleasedAt: Date | null }>;
      const newSinceRelease = flags.some((flag) => !current?.holdReleasedAt || new Date(flag.createdAt) > new Date(current.holdReleasedAt));
      const severeOpen = flags.some((flag) => flag.severity === 3 && flag.status !== 'CONFIRMED' && (!current?.holdReleasedAt || new Date(flag.createdAt) > new Date(current.holdReleasedAt)));
      const hold = !current?.payoutHold && newSinceRelease && ((settings.autoHoldHighRisk && level === 'HIGH') || severeOpen);
      await this.dataSource.query(
        `INSERT INTO "user_risk" ("userId","score","level","updatedAt") VALUES ($1,$2,$3,now())
         ON CONFLICT ("userId") DO UPDATE SET "score"=EXCLUDED."score","level"=EXCLUDED."level","updatedAt"=now()`, [userId, score, level],
      );
      if (hold) await this.dataSource.transaction((manager) => this.setHoldInTx(manager, userId, true, severeOpen ? 'A severe risk flag needs review' : `High risk score (${score})`, 'system'));

      const confirmed = flags.filter((flag) => flag.primary && flag.status === 'CONFIRMED').length;
      if (confirmed >= settings.repeatViolationCount) {
        await this.raiseFlag({
          rule: 'REPEAT_VIOLATIONS', severity: 3, userId, status: 'ESCALATED',
          reason: `${confirmed} upheld risk flags: escalated for investigation`, evidence: { confirmedFlags: confirmed },
          fingerprint: `REPEAT_VIOLATIONS:${userId}:${Math.floor(confirmed / settings.repeatViolationCount)}`,
        });
      }
    }
  }

  async setHold(actorUserId: string, userId: string, hold: boolean, note: string) {
    return this.dataSource.transaction(async (manager) => {
      await this.setHoldInTx(manager, userId, hold, note.trim(), 'admin', actorUserId);
      return this.riskOf(userId, manager);
    });
  }

  private async setHoldInTx(manager: EntityManager, userId: string, hold: boolean, reason: string, by: 'system' | 'admin', actorUserId: string | null = null) {
    await manager.query(
      `INSERT INTO "user_risk" ("userId","payoutHold","holdReason","holdSetBy","holdReleasedAt","updatedAt") VALUES ($1,$2,$3,$4,CASE WHEN $2 THEN NULL ELSE now() END,now())
       ON CONFLICT ("userId") DO UPDATE SET "payoutHold"=$2,"holdReason"=$3,"holdSetBy"=$4,
         "holdReleasedAt"=CASE WHEN $2 THEN "user_risk"."holdReleasedAt" ELSE now() END,"updatedAt"=now()`,
      [userId, hold, reason.slice(0, 300), by],
    );
    if (hold) {
      await manager.query(
        `UPDATE "payout_requests" p SET "riskHold"=true,"holdReasons"=p."holdReasons" || to_jsonb($2::text),"updatedAt"=now()
         FROM "payout_recipients" r WHERE r."id"=p."recipientId" AND r."userId"=$1 AND p."status"='PENDING_APPROVAL'`,
        [userId, `Account is on a payout hold: ${reason}`.slice(0, 300)],
      );
    }
    await this.audit(manager, actorUserId, hold ? 'PAYOUT_HOLD_SET' : 'PAYOUT_HOLD_RELEASED', 'user', userId, { reason, by });
  }

  recordDevice(userId: string, deviceId: string | undefined, ip: string | undefined) {
    if (!deviceId || !/^[A-Za-z0-9_-]{8,64}$/.test(deviceId)) return;
    void this.dataSource.query(
      `INSERT INTO "user_devices" ("userId","deviceId","lastIp") VALUES ($1,$2,$3)
       ON CONFLICT ("userId","deviceId") DO UPDATE SET "lastIp"=EXCLUDED."lastIp","lastSeenAt"=now()
       WHERE "user_devices"."lastSeenAt" < now() - interval '1 hour' OR "user_devices"."lastIp" IS DISTINCT FROM EXCLUDED."lastIp"`,
      [userId, deviceId, ip?.slice(0, 64) ?? null],
    ).catch((error) => this.logger.warn(`Could not record device: ${error instanceof Error ? error.message : String(error)}`));
  }

  async audit(manager: EntityManager, actorUserId: string | null, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>) {
    await manager.query(
      `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,$2,$3,$4,$5)`,
      [actorUserId, action, targetType, targetId, JSON.stringify(metadata)],
    );
  }

  private async notify(manager: EntityManager, userId: string, type: string, title: string, body: string) {
    await manager.query(`INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,$2,$3,$4,$5)`, [userId, type, title, body, type.startsWith('KYC') ? '/identity' : '/rewards']);
  }

  async assertUser(userId: string) {
    const [row] = await this.dataSource.query(`SELECT 1 FROM "users" WHERE "id"=$1`, [userId]) as unknown[];
    if (!row) throw new NotFoundException('Person not found');
  }
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function namesMatch(firstName: string, lastName: string, accountName: string) {
  const account = new Set(words(accountName));
  const given = [...words(firstName), ...words(lastName)];
  return given.length >= 2 && words(firstName).some((word) => account.has(word)) && words(lastName).some((word) => account.has(word));
}
