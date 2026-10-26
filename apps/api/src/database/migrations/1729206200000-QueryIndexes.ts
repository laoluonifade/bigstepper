import { MigrationInterface, QueryRunner } from 'typeorm';

const INDEXES: Array<[string, string]> = [
  ['table_registrations_user_idx', `"table_registrations" ("userId", "tableId")`],
  ['table_activity_credits_activity_idx', `"table_activity_credits" ("activityId")`],
  ['competition_tables_creator_idx', `"competition_tables" ("creatorId", "createdAt" DESC)`],
  ['competition_tables_community_idx', `"competition_tables" ("communityId", "createdAt" DESC) WHERE "communityId" IS NOT NULL`],
  ['payment_intents_table_status_idx', `"payment_intents" ("tableId", "status")`],
  ['notifications_user_created_idx', `"notifications" ("userId", "createdAt" DESC)`],
  ['users_email_lower_idx', `"users" (lower("email"))`],
  ['profiles_username_lower_idx', `"profiles" (lower("username"))`],
];

export class QueryIndexes1729206200000 implements MigrationInterface {
  name = 'QueryIndexes1729206200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, target] of INDEXES) await queryRunner.query(`CREATE INDEX IF NOT EXISTS "${name}" ON ${target}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name] of INDEXES) await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
  }
}
