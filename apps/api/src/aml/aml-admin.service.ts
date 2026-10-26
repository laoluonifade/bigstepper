import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AmlService } from './aml.service';

const PERSON = `COALESCE(p."displayName", u."displayName") "displayName", p."username", p."avatarUrl", u."email"`;

@Injectable()
export class AmlAdminService {
  constructor(private readonly dataSource: DataSource, private readonly aml: AmlService) {}

  async overview() {
    const [counts] = await this.dataSource.query(
      `SELECT (SELECT count(*)::integer FROM "risk_flags" WHERE "status"='OPEN') "openFlags",
              (SELECT count(*)::integer FROM "risk_flags" WHERE "status"='OPEN' AND "severity"=3) "severeFlags",
              (SELECT count(*)::integer FROM "risk_flags" WHERE "status"='ESCALATED') "escalated",
              (SELECT count(*)::integer FROM "user_risk" WHERE "payoutHold") "heldAccounts",
              (SELECT count(*)::integer FROM "user_risk" WHERE "level"='HIGH') "highRisk",
              (SELECT count(*)::integer FROM "payout_requests" WHERE "status"='PENDING_APPROVAL' AND "riskHold") "heldPayouts",
              (SELECT count(*)::integer FROM "kyc_verifications" WHERE "status"='VERIFIED') "kycVerified",
              (SELECT count(*)::integer FROM "kyc_verifications" WHERE "status"='PENDING') "kycPending"`,
    );
    const risky = await this.dataSource.query(
      `SELECT r."userId", r."score", r."level", r."payoutHold", r."holdReason", ${PERSON},
              (SELECT count(*)::integer FROM "risk_flags" f WHERE f."status" IN ('OPEN','ESCALATED') AND (f."userId"=r."userId" OR f."relatedUserIds" ? r."userId"::text)) "openFlags"
       FROM "user_risk" r JOIN "users" u ON u."id"=r."userId" LEFT JOIN "profiles" p ON p."userId"=r."userId"
       WHERE r."score" > 0 OR r."payoutHold" ORDER BY r."payoutHold" DESC, r."score" DESC LIMIT 25`,
    );
    return { ...counts, risky };
  }

  listFlags(status: string, userId?: string) {
    return this.dataSource.query(
      `SELECT f."id", f."rule", f."severity", f."reason", f."evidence", f."status", f."reviewNote", f."reviewedAt", f."createdAt",
              f."userId", f."relatedUserIds", f."tableId", f."payoutRequestId", ${PERSON},
              t."code" "tableCode", t."title" "tableTitle", rp."displayName" "reviewedBy",
              (SELECT json_agg(json_build_object('userId', ru."id", 'displayName', COALESCE(rpp."displayName", ru."displayName"), 'username', rpp."username"))
                 FROM "users" ru LEFT JOIN "profiles" rpp ON rpp."userId"=ru."id" WHERE f."relatedUserIds" ? ru."id"::text) "related"
       FROM "risk_flags" f JOIN "users" u ON u."id"=f."userId" LEFT JOIN "profiles" p ON p."userId"=f."userId"
       LEFT JOIN "competition_tables" t ON t."id"=f."tableId" LEFT JOIN "profiles" rp ON rp."userId"=f."reviewedByUserId"
       WHERE ($1 = 'all' OR f."status"=$1) AND ($2::text IS NULL OR f."userId"::text=$2 OR f."relatedUserIds" ? $2)
       ORDER BY CASE WHEN f."status" IN ('OPEN','ESCALATED') THEN 0 ELSE 1 END, f."severity" DESC, f."createdAt" DESC LIMIT 300`,
      [status, userId ?? null],
    );
  }

  async reviewFlag(actorUserId: string, flagId: string, decision: 'DISMISSED' | 'CONFIRMED' | 'ESCALATED', note: string) {
    const flag = await this.dataSource.transaction(async (manager) => {
      const [rows] = await manager.query(
        `UPDATE "risk_flags" SET "status"=$2,"reviewedByUserId"=$3,"reviewNote"=$4,"reviewedAt"=now()
         WHERE "id"=$1 AND ("status" IN ('OPEN','ESCALATED') OR $2 = 'ESCALATED') RETURNING "id","userId","relatedUserIds","rule","status"`,
        [flagId, decision, actorUserId, note.trim()],
      ) as [Array<{ id: string; userId: string; relatedUserIds: string[]; rule: string }>, number];
      if (!rows[0]) throw new ConflictException('This flag was already decided');
      await this.aml.audit(manager, actorUserId, `RISK_FLAG_${decision}`, 'risk_flag', flagId, { userId: rows[0].userId, rule: rows[0].rule, note: note.trim() });
      return rows[0];
    });
    if (decision === 'ESCALATED') await this.aml.setHold(actorUserId, flag.userId, true, `Escalated for investigation: ${note.trim()}`.slice(0, 300));
    await this.aml.recomputeRisk([flag.userId, ...flag.relatedUserIds]);
    return { id: flag.id, status: decision };
  }

  async userProfile(userId: string) {
    const [person] = await this.dataSource.query(
      `SELECT u."id", u."createdAt", u."emailVerified", u."lastSeenAt", ${PERSON},
              k."status" "kycStatus", k."level" "kycLevel", k."firstName", k."lastName", k."accountName", k."bankCode", k."accountLast4", k."bvnLast4", k."verifiedAt", k."failureReason",
              pr."accountName" "payoutAccountName", pr."bankCode" "payoutBankCode", pr."accountLast4" "payoutAccountLast4", pr."kycVerified" "payoutKycVerified",
              w."balanceKobo", w."frozenAt"
       FROM "users" u LEFT JOIN "profiles" p ON p."userId"=u."id" LEFT JOIN "kyc_verifications" k ON k."userId"=u."id"
       LEFT JOIN "payout_recipients" pr ON pr."userId"=u."id" LEFT JOIN "wallets" w ON w."userId"=u."id"
       WHERE u."id"=$1`, [userId],
    ) as Array<Record<string, unknown>>;
    if (!person) throw new NotFoundException('Person not found');
    const [risk, flags, linked, competitions, payouts, timeline] = await Promise.all([
      this.aml.riskOf(userId),
      this.listFlags('all', userId),
      this.linkedAccounts(userId),
      this.dataSource.query(
        `SELECT t."id", t."code", t."title", t."status", t."entryFeeKobo", t."guaranteedPrizeKobo", t."createdAt", t."scoringClosesAt",
                t."creatorId"=$1 "hosted", r."creditedDistanceMetres", r."creditedSteps",
                (SELECT count(*)::integer FROM "table_registrations" x WHERE x."tableId"=t."id" AND x."userId"<>t."creatorId") "entrants",
                (SELECT json_agg(json_build_object('userId', w."winnerUserId", 'place', w."place", 'amountKobo', w."amountKobo", 'displayName', COALESCE(wp."displayName", wu."displayName")) ORDER BY w."place")
                   FROM "prize_awards" w JOIN "users" wu ON wu."id"=w."winnerUserId" LEFT JOIN "profiles" wp ON wp."userId"=w."winnerUserId" WHERE w."tableId"=t."id") "winners"
         FROM "competition_tables" t LEFT JOIN "table_registrations" r ON r."tableId"=t."id" AND r."userId"=$1
         WHERE t."type"='paid' AND (r."id" IS NOT NULL OR t."creatorId"=$1)
         ORDER BY t."createdAt" DESC LIMIT 100`, [userId],
      ),
      this.dataSource.query(
        `SELECT p."id", p."status", p."createdAt", p."reviewedAt", p."riskHold", p."holdReasons", p."escalatedAt", p."decisionNote", p."rejectionReason",
                COALESCE(a."amountKobo", e."amountKobo")::integer "amountKobo", CASE WHEN p."awardId" IS NOT NULL THEN 'PRIZE' ELSE 'CREATOR' END "kind"
         FROM "payout_requests" p JOIN "payout_recipients" r ON r."id"=p."recipientId"
         LEFT JOIN "prize_awards" a ON a."id"=p."awardId" LEFT JOIN "creator_earnings" e ON e."id"=p."creatorEarningId"
         WHERE r."userId"=$1 ORDER BY p."createdAt" DESC LIMIT 100`, [userId],
      ),
      this.moneyTimeline(userId),
    ]);
    return { person, risk, flags, linked, competitions, payouts, timeline };
  }

  linkedAccounts(userId: string) {
    return this.dataSource.query(
      `WITH links AS (
         SELECT d2."userId", 'device' "via" FROM "user_devices" d1 JOIN "user_devices" d2 ON d2."deviceId"=d1."deviceId" AND d2."userId"<>d1."userId" WHERE d1."userId"=$1
         UNION SELECT d2."userId", 'ip' FROM "user_devices" d1 JOIN "user_devices" d2 ON d2."lastIp"=d1."lastIp" AND d2."userId"<>d1."userId"
           WHERE d1."userId"=$1 AND d1."lastIp" IS NOT NULL AND d2."lastSeenAt" >= now() - interval '30 days'
         UNION SELECT k2."userId", 'bvn' FROM "kyc_verifications" k1 JOIN "kyc_verifications" k2 ON k2."bvnHash"=k1."bvnHash" AND k2."userId"<>k1."userId" WHERE k1."userId"=$1
         UNION SELECT x."userId", 'bank account' FROM (
             SELECT "accountHash" h FROM "payout_recipients" WHERE "userId"=$1 AND "accountHash" IS NOT NULL
             UNION SELECT "accountHash" FROM "kyc_verifications" WHERE "userId"=$1 AND "accountHash" IS NOT NULL) mine
           JOIN (SELECT "userId", "accountHash" h FROM "payout_recipients" UNION SELECT "userId", "accountHash" FROM "kyc_verifications") x ON x.h=mine.h AND x."userId"<>$1)
       SELECT l."userId", array_agg(DISTINCT l."via") "via", ${PERSON}, r."score", r."level", r."payoutHold"
       FROM links l JOIN "users" u ON u."id"=l."userId" LEFT JOIN "profiles" p ON p."userId"=l."userId" LEFT JOIN "user_risk" r ON r."userId"=l."userId"
       GROUP BY l."userId", u."id", p."displayName", p."username", p."avatarUrl", r."score", r."level", r."payoutHold"
       ORDER BY count(*) DESC LIMIT 50`, [userId],
    );
  }

  moneyTimeline(userId: string) {
    return this.dataSource.query(
      `SELECT * FROM (
         SELECT i."createdAt" at, CASE i."purpose" WHEN 'WALLET_FUNDING' THEN 'deposit' WHEN 'SPONSOR_FUNDING' THEN 'prize funding' ELSE 'entry' END kind,
                -i."amountKobo"::bigint "amountKobo", i."status", i."reference", t."code" "tableCode", 'Paystack' via
         FROM "payment_intents" i LEFT JOIN "competition_tables" t ON t."id"=i."tableId" WHERE i."userId"=$1
         UNION ALL
         SELECT wt."createdAt", CASE wt."type" WHEN 'CHALLENGE_ENTRY' THEN 'entry' WHEN 'FUNDING' THEN 'wallet credit' ELSE lower(wt."type") END,
                wt."amountKobo"::bigint, 'POSTED', wt."reference", NULL, 'Wallet'
         FROM "wallet_transactions" wt JOIN "wallets" w ON w."id"=wt."walletId" WHERE w."userId"=$1 AND wt."type" <> 'FUNDING'
         UNION ALL
         SELECT a."createdAt", 'winnings', a."amountKobo"::bigint, a."status", 'place ' || a."place" || ' · fee ₦' || (a."platformFeeKobo" / 100)::text, t."code", 'Prize'
         FROM "prize_awards" a JOIN "competition_tables" t ON t."id"=a."tableId" WHERE a."winnerUserId"=$1
         UNION ALL
         SELECT e."createdAt", 'creator earnings', e."amountKobo"::bigint, e."status", NULL, t."code", 'Commission'
         FROM "creator_earnings" e JOIN "creator_profiles" c ON c."id"=e."creatorProfileId" LEFT JOIN "competition_tables" t ON t."id"=e."tableId" WHERE c."userId"=$1
         UNION ALL
         SELECT rr."createdAt", 'refund', rr."amountKobo"::bigint, rr."status", i."reference", t."code", 'Paystack'
         FROM "refund_requests" rr JOIN "payment_intents" i ON i."id"=rr."paymentIntentId" LEFT JOIN "competition_tables" t ON t."id"=i."tableId" WHERE i."userId"=$1
         UNION ALL
         SELECT p."createdAt", 'withdrawal', -COALESCE(a."amountKobo", e."amountKobo")::bigint, p."status", NULL, NULL, 'Bank transfer'
         FROM "payout_requests" p JOIN "payout_recipients" r ON r."id"=p."recipientId"
         LEFT JOIN "prize_awards" a ON a."id"=p."awardId" LEFT JOIN "creator_earnings" e ON e."id"=p."creatorEarningId" WHERE r."userId"=$1
       ) money ORDER BY at DESC LIMIT 300`, [userId],
    );
  }

  auditLog(input: { targetId?: string; action?: string }) {
    return this.dataSource.query(
      `SELECT a."id", a."action", a."targetType", a."targetId", a."metadata", a."createdAt", a."actorUserId",
              COALESCE(p."displayName", u."displayName", CASE WHEN a."actorUserId" IS NULL THEN 'System' END) "actor"
       FROM "admin_audit_events" a LEFT JOIN "users" u ON u."id"=a."actorUserId" LEFT JOIN "profiles" p ON p."userId"=a."actorUserId"
       WHERE ($1::text IS NULL OR a."targetId"=$1 OR a."metadata"->>'userId'=$1) AND ($2::text IS NULL OR a."action" ILIKE $2 || '%')
       ORDER BY a."createdAt" DESC LIMIT 300`,
      [input.targetId ?? null, input.action ?? null],
    );
  }
}
