import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { Db, exists, flag, id, num, row, rows, run, text, when } from '../database/sql';

export type LedgerAccount = 'processor_clearing' | 'sponsor_prize_liability' | 'wallet_liability' | 'contest_entry_liability';

const payout = z.object({
  id, status: text, userId: id, amountKobo: num, providerRecipientCode: text, availableForPayoutAt: when,
  riskHold: flag, kycVerified: flag, blocked: flag,
});

@Injectable()
export class PaymentsRepository {
  constructor(private readonly dataSource: DataSource) {}

  private get db(): Db {
    return this.dataSource;
  }

  async entrantsOtherThan(db: Db, tableId: string, userId: string) {
    return (await row(db, z.object({ count: num }),
      `SELECT COUNT(*)::integer count FROM "table_registrations" WHERE "tableId"=$1 AND "userId"<>$2`, [tableId, userId]))!.count;
  }

  lockWallet(db: Db, userId: string) {
    return row(db, z.object({ id, balanceKobo: num, frozenAt: when.nullable() }),
      `SELECT "id","balanceKobo","frozenAt" FROM "wallets" WHERE "userId"=$1 FOR UPDATE`, [userId]);
  }

  async ensureWallet(db: Db, userId: string) {
    return (await row(db, z.object({ id, balanceKobo: num }),
      `INSERT INTO "wallets" ("userId") VALUES ($1) ON CONFLICT ("userId") DO UPDATE SET "userId"=EXCLUDED."userId" RETURNING "id","balanceKobo"`,
      [userId]))!;
  }

  setWalletBalance(db: Db, walletId: string, balanceKobo: number) {
    return run(db, `UPDATE "wallets" SET "balanceKobo"=$1,"updatedAt"=now() WHERE "id"=$2`, [balanceKobo, walletId]);
  }

  recordWalletTransaction(db: Db, entry: { walletId: string; type: 'CHALLENGE_ENTRY' | 'FUNDING'; amountKobo: number; balanceAfterKobo: number; reference: string; description: string }) {
    return run(db,
      `INSERT INTO "wallet_transactions" ("walletId","type","amountKobo","balanceAfterKobo","reference","description") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("reference") DO NOTHING`,
      [entry.walletId, entry.type, entry.amountKobo, entry.balanceAfterKobo, entry.reference, entry.description]);
  }

  acceptPendingInvitation(db: Db, tableId: string, userId: string) {
    return run(db,
      `UPDATE "challenge_invitations" SET "status"='ACCEPTED',"respondedAt"=now()
       WHERE "tableId"=$1 AND "invitedUserId"=$2 AND "status"='PENDING'`,
      [tableId, userId]);
  }

  async postLedger(db: Db, entry: { reference: string; description: string; debit: LedgerAccount; credit: LedgerAccount; amountKobo: number }) {
    const journal = await row(db, z.object({ id }),
      `INSERT INTO "ledger_journals" ("reference","description") VALUES ($1,$2) ON CONFLICT ("reference") DO NOTHING RETURNING "id"`,
      [entry.reference, entry.description]);
    if (!journal) return;
    await run(db,
      `INSERT INTO "ledger_entries" ("journalId","accountId","currency","amountKobo") SELECT $1,"id",'NGN',CASE "code" WHEN $3 THEN $2::bigint ELSE -($2::bigint) END FROM "ledger_accounts" WHERE "code" IN ($3,$4)`,
      [journal.id, entry.amountKobo, entry.debit, entry.credit]);
  }

  rewards(userId: string) {
    return rows(this.db,
      z.object({
        id, tableId: id.nullable(), tableTitle: text.nullable(), tableCode: text.nullable(), place: num, grossPrizeKobo: num, platformFeeKobo: num,
        creatorCommissionKobo: num, amountKobo: num, currency: text, status: text, createdAt: when, payoutRequested: flag,
      }),
      `SELECT a."id",a."tableId",t."title" AS "tableTitle",t."code" AS "tableCode",a."place",a."grossPrizeKobo",a."platformFeeKobo",a."creatorCommissionKobo",a."amountKobo",a."currency",a."status",a."createdAt",
              EXISTS (SELECT 1 FROM "payout_requests" p WHERE p."awardId"=a."id" AND p."status" <> 'REJECTED') AS "payoutRequested"
       FROM "prize_awards" a LEFT JOIN "competition_tables" t ON t."id"=a."tableId"
       WHERE a."winnerUserId"=$1 ORDER BY a."createdAt" DESC`,
      [userId]);
  }

  hasRecipient(db: Db, userId: string) {
    return exists(db, `SELECT "id" FROM "payout_recipients" WHERE "userId"=$1 FOR UPDATE`, [userId]);
  }

  async saveRecipient(db: Db, recipient: { userId: string; providerRecipientCode: string; accountName: string; bankCode: string; accountLast4: string; availableForPayoutAt: Date; accountHash: string }) {
    return (await row(db,
      z.object({ id, accountName: text, bankCode: text, accountLast4: text, currency: text, availableForPayoutAt: when }),
      `INSERT INTO "payout_recipients" ("userId","providerRecipientCode","accountName","bankCode","accountLast4","availableForPayoutAt","accountHash","kycVerified") VALUES ($1,$2,$3,$4,$5,$6,$7,false)
       ON CONFLICT ("userId") DO UPDATE SET "providerRecipientCode"=EXCLUDED."providerRecipientCode","accountName"=EXCLUDED."accountName",
         "bankCode"=EXCLUDED."bankCode","accountLast4"=EXCLUDED."accountLast4","availableForPayoutAt"=EXCLUDED."availableForPayoutAt",
         "accountHash"=EXCLUDED."accountHash","kycVerified"=false,"updatedAt"=now()
       RETURNING "id","accountName","bankCode","accountLast4","currency","availableForPayoutAt"`,
      [recipient.userId, recipient.providerRecipientCode, recipient.accountName, recipient.bankCode, recipient.accountLast4, recipient.availableForPayoutAt, recipient.accountHash]))!;
  }

  audit(db: Db, event: { actorUserId: string; action: string; targetType: string; targetId: string; metadata: unknown }) {
    return run(db,
      `INSERT INTO "admin_audit_events" ("actorUserId","action","targetType","targetId","metadata") VALUES ($1,$2,$3,$4,$5)`,
      [event.actorUserId, event.action, event.targetType, event.targetId, JSON.stringify(event.metadata)]);
  }

  notify(db: Db, notification: { userId: string; type: string; title: string; body: string; link: string }) {
    return run(db,
      `INSERT INTO "notifications" ("userId","type","title","body","link") VALUES ($1,$2,$3,$4,$5)`,
      [notification.userId, notification.type, notification.title, notification.body, notification.link]);
  }

  async lockAwardAmount(db: Db, awardId: string, userId: string) {
    return (await row(db, z.object({ amountKobo: num }), `SELECT "amountKobo" FROM "prize_awards" WHERE "id"=$1 AND "winnerUserId"=$2 FOR UPDATE`, [awardId, userId]))?.amountKobo;
  }

  requestPrizePayout(db: Db, awardId: string, userId: string) {
    return row(db, z.object({ id }).passthrough(),
      `INSERT INTO "payout_requests" ("awardId","recipientId")
       SELECT a."id",r."id" FROM "prize_awards" a
       JOIN "payout_recipients" r ON r."userId"=a."winnerUserId"
       JOIN "competition_tables" t ON t."id"=a."tableId"
       WHERE a."id"=$1 AND a."winnerUserId"=$2 AND a."status"='PENDING_APPROVAL' AND r."availableForPayoutAt" <= now()
         AND (t."type"<>'sponsored' OR (
           EXISTS (SELECT 1 FROM "payment_intents" i WHERE i."tableId"=t."id" AND i."purpose"='SPONSOR_FUNDING' AND i."status"='SUCCEEDED')
           AND NOT EXISTS (SELECT 1 FROM "payment_intents" i WHERE i."tableId"=t."id" AND i."purpose"='SPONSOR_FUNDING' AND i."status"='DISPUTED')
         ))
       ON CONFLICT ("awardId") WHERE "status" <> 'REJECTED' DO NOTHING RETURNING *`,
      [awardId, userId]);
  }

  async lockCreatorEarningAmount(db: Db, earningId: string, userId: string) {
    return (await row(db, z.object({ amountKobo: num }),
      `SELECT e."amountKobo" FROM "creator_earnings" e JOIN "creator_profiles" c ON c."id"=e."creatorProfileId" WHERE e."id"=$1 AND c."userId"=$2 FOR UPDATE OF e`,
      [earningId, userId]))?.amountKobo;
  }

  requestCreatorPayout(db: Db, earningId: string, userId: string) {
    return row(db, z.object({ id }).passthrough(),
      `INSERT INTO "payout_requests" ("creatorEarningId","recipientId")
       SELECT e."id",r."id" FROM "creator_earnings" e
       JOIN "creator_profiles" c ON c."id"=e."creatorProfileId"
       JOIN "payout_recipients" r ON r."userId"=c."userId"
       WHERE e."id"=$1 AND c."userId"=$2 AND e."status"='EARNED' AND r."availableForPayoutAt" <= now()
       ON CONFLICT ("creatorEarningId") WHERE "status" <> 'REJECTED' DO NOTHING RETURNING *`,
      [earningId, userId]);
  }

  setCreatorEarningStatus(db: Db, earningId: string, status: 'EARNED' | 'PENDING_PAYOUT') {
    return run(db, `UPDATE "creator_earnings" SET "status"=$2 WHERE "id"=$1`, [earningId, status]);
  }

  payouts(view: 'pending' | 'history') {
    return rows(this.db, z.object({ id, status: text, kind: z.enum(['PRIZE', 'CREATOR']), amountKobo: num, userId: id, blocked: flag }).passthrough(),
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
      [view]);
  }

  lockPayoutForApproval(db: Db, payoutId: string) {
    return row(db, payout,
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
      [payoutId]);
  }

  async startPayout(db: Db, payoutId: string, actorUserId: string, note: string | null, reference: string) {
    await run(db,
      `UPDATE "payout_requests" SET "status"='PROCESSING',"approvedByUserId"=$1,"reviewedAt"=now(),"decisionNote"=COALESCE($3,"decisionNote"),"updatedAt"=now() WHERE "id"=$2`,
      [actorUserId, payoutId, note]);
    await run(db, `INSERT INTO "payout_attempts" ("payoutRequestId","reference") VALUES ($1,$2)`, [payoutId, reference]);
  }

  recordTransfer(reference: string, transfer: { transfer_code: string; status: string }) {
    return run(this.db,
      `UPDATE "payout_attempts" SET "providerTransferCode"=$1,"status"=$2,"providerPayload"=$3,"updatedAt"=now() WHERE "reference"=$4`,
      [transfer.transfer_code, transfer.status.toUpperCase(), JSON.stringify(transfer), reference]);
  }

  flagTransferForReconciliation(reference: string) {
    return run(this.db, `UPDATE "payout_attempts" SET "status"='RECONCILIATION_REQUIRED',"updatedAt"=now() WHERE "reference"=$1`, [reference]);
  }

  rejectPayout(db: Db, payoutId: string, actorUserId: string, reason: string) {
    return row(db, z.object({ id, creatorEarningId: id.nullable(), userId: id }),
      `WITH rejected AS (
         UPDATE "payout_requests" p SET "status"='REJECTED',"rejectionReason"=$3,"decisionNote"=$3,"approvedByUserId"=$1,"reviewedAt"=now(),"updatedAt"=now()
         FROM "payout_recipients" r
         WHERE p."id"=$2 AND p."status"='PENDING_APPROVAL' AND r."id"=p."recipientId"
         RETURNING p."id", p."creatorEarningId", r."userId"
       ) SELECT * FROM rejected`,
      [actorUserId, payoutId, reason]);
  }

  async startReconciliation() {
    return (await row(this.db, z.object({ id }), `INSERT INTO "reconciliation_runs" ("provider") VALUES ('paystack') RETURNING "id"`))!.id;
  }

  async openPaymentReferences() {
    return (await rows(this.db, z.object({ reference: text }),
      `SELECT "reference" FROM "payment_intents" WHERE "status" IN ('PENDING','RECONCILIATION_REQUIRED') ORDER BY "createdAt" ASC LIMIT 100`)).map((intent) => intent.reference);
  }

  async openTransferReferences() {
    return (await rows(this.db, z.object({ reference: text }),
      `SELECT "reference" FROM "payout_attempts" WHERE "status" IN ('INITIATED','PENDING','PROCESSING','RECONCILIATION_REQUIRED') ORDER BY "createdAt" ASC LIMIT 100`)).map((attempt) => attempt.reference);
  }

  finishReconciliation(runId: string, status: 'COMPLETED' | 'COMPLETED_WITH_ERRORS', summary: unknown) {
    return run(this.db, `UPDATE "reconciliation_runs" SET "status"=$1,"summary"=$2,"completedAt"=now() WHERE "id"=$3`, [status, JSON.stringify(summary), runId]);
  }

  async abandonedCheckoutReferences() {
    return (await rows(this.db, z.object({ reference: text }),
      `SELECT "reference" FROM "payment_intents"
       WHERE "status" IN ('INITIATED','PENDING') AND "createdAt" <= now() - interval '15 minutes'
         AND "updatedAt" <= now() - interval '5 minutes'
       ORDER BY "createdAt" ASC LIMIT 20`)).map((intent) => intent.reference);
  }

  settleUnpaidIntent(intentId: string, failed: boolean, review: boolean, providerStatus: string) {
    return run(this.db,
      `UPDATE "payment_intents" SET "status"=CASE WHEN $2 THEN 'FAILED' WHEN $3 THEN 'RECONCILIATION_REQUIRED' ELSE "status" END,"providerStatus"=$4,"updatedAt"=now()
       WHERE "id"=$1 AND "status" IN ('INITIATED','PENDING','RECONCILIATION_REQUIRED','FAILED')`,
      [intentId, failed, review, providerStatus]);
  }

  requestRefund(db: Db, refund: { paymentIntentId: string; amountKobo: number; currency: string; reason: string }) {
    return run(db,
      `INSERT INTO "refund_requests" ("paymentIntentId","amountKobo","currency","reason") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [refund.paymentIntentId, refund.amountKobo, refund.currency, refund.reason]);
  }

  recordRefund(paymentIntentId: string, refund: { id: number; status: string }) {
    return run(this.db,
      `UPDATE "refund_requests" SET "status"=$1,"providerRefundId"=$2,"updatedAt"=now() WHERE "paymentIntentId"=$3`,
      [refund.status === 'processed' ? 'SUCCEEDED' : 'PROCESSING', String(refund.id), paymentIntentId]);
  }

  async applyRefundEvent(db: Db, reference: string, succeeded: boolean, providerRefundId: string | null) {
    await run(db,
      `UPDATE "refund_requests" r SET "status"=$1,"providerRefundId"=COALESCE($2,"providerRefundId"),"updatedAt"=now()
       FROM "payment_intents" p WHERE p."id"=r."paymentIntentId" AND p."reference"=$3`,
      [succeeded ? 'SUCCEEDED' : 'PROCESSING', providerRefundId, reference]);
    if (succeeded) await run(db, `UPDATE "payment_intents" SET "status"='REFUNDED',"updatedAt"=now() WHERE "reference"=$1 AND "status"='REFUND_PENDING'`, [reference]);
  }

  async sponsorFundingTotal(db: Db, tableId: string) {
    return (await row(db, z.object({ amount: num }),
      `SELECT COALESCE(SUM("amountKobo"),0)::bigint AS amount FROM "payment_intents" WHERE "tableId"=$1 AND "purpose"='SPONSOR_FUNDING' AND "status"='SUCCEEDED'`,
      [tableId]))!.amount;
  }

  async applyTransferEvent(db: Db, reference: string, status: 'SUCCEEDED' | 'REVERSED' | 'FAILED') {
    const attempt = await row(db, z.object({ payoutRequestId: id }),
      `WITH updated AS (
         UPDATE "payout_attempts" SET "status"=$1,"updatedAt"=now() WHERE "reference"=$2 RETURNING "payoutRequestId"
       ) SELECT * FROM updated`,
      [status, reference]);
    if (!attempt) return false;
    const outcome = status === 'SUCCEEDED' ? 'PAID' : status;
    await run(db, `UPDATE "payout_requests" SET "status"=$1,"updatedAt"=now() WHERE "id"=$2`, [status, attempt.payoutRequestId]);
    await run(db, `UPDATE "prize_awards" a SET "status"=$1 FROM "payout_requests" p WHERE p."awardId"=a."id" AND p."id"=$2`, [outcome, attempt.payoutRequestId]);
    await run(db, `UPDATE "creator_earnings" e SET "status"=$1 FROM "payout_requests" p WHERE p."creatorEarningId"=e."id" AND p."id"=$2`, [outcome, attempt.payoutRequestId]);
    return true;
  }

  async freezeDisputedPayer(db: Db, reference: string, eventType: string) {
    const disputed = await row(db, z.object({ userId: id }),
      `WITH disputed AS (
         UPDATE "payment_intents" SET "status"='DISPUTED',"providerStatus"=$1,"updatedAt"=now()
         WHERE "reference"=$2 AND "status" IN ('SUCCEEDED','DISPUTED') RETURNING "userId"
       ) SELECT * FROM disputed`,
      [eventType, reference]);
    if (!disputed) return false;
    await run(db, `UPDATE "wallets" SET "frozenAt"=COALESCE("frozenAt",now()),"freezeReason"='PAYMENT_DISPUTE',"updatedAt"=now() WHERE "userId"=$1`, [disputed.userId]);
    await run(db,
      `INSERT INTO "user_eligibility" ("userId","paidCompetitionEligible") VALUES ($1,false)
       ON CONFLICT ("userId") DO UPDATE SET "paidCompetitionEligible"=false,"updatedAt"=now()`,
      [disputed.userId]);
    await run(db,
      `UPDATE "payout_requests" p SET "status"='SECURITY_HOLD',"updatedAt"=now()
       FROM "payout_recipients" r WHERE p."recipientId"=r."id" AND r."userId"=$1
         AND p."status" IN ('PENDING_APPROVAL','APPROVED')`,
      [disputed.userId]);
    return true;
  }

  isPaidBlocked(db: Db, userId: string) {
    return exists(db, `SELECT 1 FROM "user_eligibility" WHERE "userId"=$1 AND "paidCompetitionEligible"=false`, [userId]);
  }
}
