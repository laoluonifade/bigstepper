const assert = require('node:assert/strict');
const { Client } = require('../apps/api/node_modules/pg');
const path = require('node:path');
const root = path.resolve(__dirname, '../apps/api/dist');
const { EngagementPolicy1793448000000 } = require(root + '/database/migrations/1793448000000-EngagementPolicy.js');
const { EngagementService } = require(root + '/notifications/engagement.service.js');
const { EngagementProcessor } = require(root + '/notifications/engagement.processor.js');
const { EngagementAdminController } = require(root + '/notifications/engagement.controller.js');
const { ClubsService } = require(root + '/clubs/clubs.service.js');
(async () => {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database. Build apps/api first.');
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  const schema = 'engagement_validation_' + process.pid;
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}",public`);
  const pg = {
    query: (s, p) => client.query(s, p),
    exec: (s) => client.query(s),
    transaction: async (fn) => {
      await client.query('BEGIN');
      try {
        const result = await fn(pg);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    },
  };
  try {
    const sql = async (s, p) => (await pg.query(s, p)).rows;
    await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY,"deletedAt" timestamptz,"emailVerified" boolean DEFAULT true,"displayName" text);
 CREATE TABLE profiles("userId" uuid PRIMARY KEY,"emailActivityEnabled" boolean DEFAULT true,"emailDigestEnabled" boolean DEFAULT true,"weeklyGoalMetres" int,"displayName" text,username text,"avatarUrl" text,gender text,"verifiedAt" timestamptz);
 CREATE TABLE challenge_reminder_deliveries(id uuid PRIMARY KEY); CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"userId" uuid REFERENCES users(id),type text,title text,body text,link text,"createdAt" timestamptz DEFAULT now());
 CREATE TABLE push_tokens(token text,"userId" uuid REFERENCES users(id));
 CREATE TABLE activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"userId" uuid,"verificationStatus" text,"activityType" text,"validatedDistanceMetres" int DEFAULT 0,"stepDistanceMetres" int DEFAULT 0,"validatedSteps" int DEFAULT 0,"stepsSource" text,"startedAt" timestamptz,"finishedAt" timestamptz);
 CREATE TABLE clubs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text,name text,"suspendedAt" timestamptz);
 CREATE TABLE club_memberships("clubId" uuid,"userId" uuid,"joinedAt" timestamptz DEFAULT now());
 CREATE TABLE competition_tables(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text,title text,status text,"deletedAt" timestamptz,"archivedAt" timestamptz,"startsAt" timestamptz,"scoringClosesAt" timestamptz,"createdAt" timestamptz DEFAULT now());
 CREATE TABLE table_registrations("tableId" uuid,"userId" uuid,"joinedAt" timestamptz DEFAULT now());`);
    await new EngagementPolicy1793448000000().up({ query: async (s) => pg.exec(s) });
    const db = {
      query: sql,
      transaction: (fn) => pg.transaction((tx) => fn({ query: async (s, p) => (await tx.query(s, p)).rows })),
    };
    const id = '00000000-0000-4000-8000-000000000001';
    const club = '00000000-0000-4000-8000-000000000002';
    await sql('INSERT INTO users(id,"displayName") VALUES($1,$2)', [id, 'Runner']);
    await sql('INSERT INTO profiles("userId","weeklyGoalMetres") VALUES($1,1000)', [id]);
    await sql('INSERT INTO push_tokens VALUES($1,$2)', ['ExponentPushToken[a]', id]);
    await sql('INSERT INTO notification_preferences("userId",value) VALUES($1,$2)', [
      id,
      JSON.stringify({ timeZone: 'UTC', quietStart: 0, quietEnd: 0, categories: {} }),
    ]);
    const policy = new EngagementService(db);
    const c = { userId: id, type: 'MILESTONE', key: '1', link: '/activities', createdAt: new Date() };
    const first = await policy.reserve(c, 'push');
    assert.equal(first.allowed, true);
    await policy.finish(first.id, 'sent');
    assert.equal((await policy.reserve(c, 'push')).reason, 'duplicate');
    assert.equal((await policy.reserve({ ...c, key: '2' }, 'push')).allowed, true);
    assert.equal((await policy.reserve({ ...c, key: '3' }, 'push')).reason, 'frequency_limit');
    assert.equal(
      (await policy.reserve({ ...c, key: '4', type: 'STANDING_BOOST' }, 'push')).reason,
      'unestablished_sync_freshness',
    );
    const processor = new EngagementProcessor(db, policy, {});
    await sql('INSERT INTO clubs(id,slug,name) VALUES($1,$2,$3)', [club, 'test', 'Test Club']);
    await sql('INSERT INTO club_memberships("clubId","userId") VALUES($1,$2)', [club, id]);
    await sql(
      `INSERT INTO activities("userId","verificationStatus","activityType","validatedDistanceMetres","validatedSteps","stepsSource","startedAt","finishedAt") VALUES($1,'VERIFIED','walk',1500,2000,'sensor',date_trunc('week',now())+interval '1 minute',now()-interval '1 minute')`,
      [id],
    );
    await sql(
      `INSERT INTO activities("userId","verificationStatus","activityType","validatedDistanceMetres","startedAt","finishedAt") VALUES($1,'PENDING_VERIFICATION','walk',99000,date_trunc('week',now())+interval '1 minute',now())`,
      [id],
    );
    await processor.weeklyGoals();
    await processor.weeklyGoals();
    assert.equal((await sql(`SELECT count(*)::int AS n FROM notifications WHERE type='WEEKLY_GOAL'`))[0].n, 1);
    await sql(
      `INSERT INTO activities("userId","verificationStatus","activityType","validatedDistanceMetres","validatedSteps","stepsSource","startedAt","finishedAt") VALUES($1,'VERIFIED','walk',1000,1400,'sensor',date_trunc('week',now())-interval '2 days',date_trunc('week',now())-interval '1 day')`,
      [id],
    );
    await processor.weeklyRecaps();
    await processor.weeklyRecaps();
    assert.equal((await sql(`SELECT count(*)::int AS n FROM notifications WHERE type='WEEKLY_RECAP'`))[0].n, 1);
    const recap = (await sql(`SELECT body FROM notifications WHERE type='WEEKLY_RECAP'`))[0].body;
    assert.ok(recap.includes('Test Club'));
    assert.ok(recap.includes('1.0 km'));
    assert.ok(!recap.includes('99.0'));
    const comp = '00000000-0000-4000-8000-000000000003';
    await sql(
      `INSERT INTO competition_tables(id,code,title,status,"startsAt","scoringClosesAt") VALUES($1,'ABC','Challenge','ACTIVE',now()-interval '1 day',now()+interval '30 minutes')`,
      [comp],
    );
    await sql('INSERT INTO table_registrations("tableId","userId") VALUES($1,$2)', [comp, id]);
    await processor.deadlines();
    await processor.deadlines();
    assert.equal((await sql(`SELECT count(*)::int AS n FROM notifications WHERE type='COMPETITION_ENDING'`))[0].n, 1);
    // Run the weekly leaderboard query through the real service while preserving its membership check contract.
    const clubs = new ClubsService();
    clubs.find = async () => ({ id: club });
    clubs.roleOf = async () => 'member';
    clubs.dataSource = db;
    const board = await clubs.weekLeaderboard(id, club);
    assert.equal(board[0].weekMetres, 1500);
    const report = await new EngagementAdminController(policy, db).performance();
    assert.ok(report.delivery.length > 0);
    await sql(`UPDATE notification_settings SET "updatedBy"=$1`,[id]);
 await sql(`INSERT INTO notification_settings_audit("actorId",value) VALUES($1,'{}')`,[id]);
 await sql(`DELETE FROM notifications WHERE "userId"=$1`,[id]);
 await sql(`DELETE FROM push_tokens WHERE "userId"=$1`,[id]);
 await sql(`DELETE FROM users WHERE id=$1`,[id]);
 await new EngagementPolicy1793448000000().down({ query: async (s) => pg.exec(s) });
    console.log(
      'PASS: migration up/down, reservations/caps/dedup/freshness, verified weekly goal, automatic club recap, deadline idempotency, weekly leaderboard, analytics SQL',
    );
  } finally {
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
