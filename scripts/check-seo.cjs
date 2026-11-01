const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { PagesService } = require(
  root + '/apps/api/dist/pages/pages.service.js',
);
const { OrganicAcquisition1793550000000 } = require(
  root +
    '/apps/api/dist/database/migrations/1793550000000-OrganicAcquisition.js',
);
async function run(pg) {
  const query = async (sql, params) => (await pg.query(sql, params)).rows;
  await pg.exec(`CREATE TABLE clubs(id uuid PRIMARY KEY,slug text UNIQUE,name text,description text,location text,"logoUrl" text,privacy text,"suspendedAt" timestamptz,"updatedAt" timestamptz DEFAULT now());
 CREATE TABLE club_events(id uuid PRIMARY KEY,slug text UNIQUE,"clubId" uuid REFERENCES clubs(id),title text,activity text,notes text,venue text,address text,"countryCode" text,latitude double precision,longitude double precision,"coverUrl" text,"timeZone" text,"durationMinutes" int,"updatedAt" timestamptz DEFAULT now(),"deletedAt" timestamptz,"publishedAt" timestamptz,"repeat" text,"repeatEvery" smallint DEFAULT 1,weekdays smallint[] DEFAULT '{}',"monthMode" text,"monthWeek" smallint,"startsOn" date,"endsOn" date,"startTime" time);
 CREATE TABLE event_ticket_types(id uuid PRIMARY KEY,"eventId" uuid REFERENCES club_events(id),name text,"priceMinor" int,currency text,capacity int,"sortOrder" int DEFAULT 0,"createdAt" timestamptz DEFAULT now());
 CREATE TABLE club_event_attendees(id uuid,"ticketTypeId" uuid,"cancelledAt" timestamptz);
 CREATE TABLE competition_tables(id uuid PRIMARY KEY,code text UNIQUE,title text,description text,"bannerUrl" text,type text,status text,"startsAt" timestamptz,"scoringClosesAt" timestamptz,"entryClosesAt" timestamptz,"challengeType" text,"scoringMethod" text,"eligibleActivities" jsonb,"targetSeconds" int,"targetSessions" int,"dailyTarget" int,"minSessions" int,format text,"targetSteps" int,"targetDistanceMetres" int,"minActivityMetres" int,"minActivitySeconds" int,"entryFeeKobo" int,capacity int,"createdAt" timestamptz DEFAULT now(),"timeZone" text,visibility text,"deletedAt" timestamptz,"archivedAt" timestamptz,"communityId" uuid REFERENCES clubs(id));`);
  const migration = readFileSync(
    root +
      '/apps/api/src/database/migrations/1729206800000-EventSchedulesAndPasses.ts',
    'utf8',
  );
  const fn = migration.match(
    /CREATE FUNCTION club_event_next\("repeat"[\s\S]*?AS \$\$[\s\S]*?\$\$/,
  )[0];
  await pg.exec(fn);
  const ids = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ];
  for (let i = 0; i < 3; i++)
    await query(
      `INSERT INTO clubs(id,slug,name,description,location,privacy) VALUES($1,$2,$3,$4,'Test location',$5)`,
      [
        ids[i],
        ['test-public-club', 'test-other-club', 'test-private-club'][i],
        ['Public test club', 'Other test club', 'Private test club'][i],
        'An explicitly synthetic running club fixture used only in an isolated test schema.',
        i === 2 ? 'invite' : 'open',
      ],
    );
  const eventIds = [
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
  ];
  for (let i = 0; i < 3; i++)
    await query(
      `INSERT INTO club_events(id,slug,"clubId",title,activity,notes,venue,address,"countryCode",latitude,longitude,"timeZone","durationMinutes","publishedAt","repeat","startsOn","startTime") VALUES($1,$2,$3,$4,'run','A synthetic test event, never production content.','Test meeting point','Test address','NG',6.5,3.3,'UTC',60,now(),'once',current_date+7,'07:00')`,
      [
        eventIds[i],
        ['test-public-event', 'test-other-event', 'test-private-event'][i],
        ids[i],
        'Test event ' + i,
      ],
    );
  await query(
    `INSERT INTO event_ticket_types(id,"eventId",name,"priceMinor",currency) VALUES('20000000-0000-4000-8000-000000000001',$1,'Free test pass',0,'NGN')`,
    [eventIds[0]],
  );
  for (let i = 0; i < 3; i++)
    await query(
      `INSERT INTO competition_tables(id,code,title,description,type,status,"startsAt","scoringClosesAt","challengeType","scoringMethod","eligibleActivities","targetSteps","entryFeeKobo","timeZone",visibility,"communityId") VALUES($1,$2,'Test competition','A synthetic movement competition for SQL validation only.','free','ACTIVE',now(),now()+interval '7 days','RUN','MOST_STEPS','["run","walk"]',10000,0,'UTC',$3,$4)`,
      [
        [
          '30000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000002',
          '30000000-0000-4000-8000-000000000003',
        ][i],
        ['PUBLIC01', 'PRIVATE1', 'PRIVATE2'][i],
        i === 1 ? 'private' : 'public',
        ids[i],
      ],
    );
  const pages = new PagesService(
    { query },
    { get: () => undefined, getOrThrow: () => 'https://startajump.com' },
  );
  await query(`UPDATE club_events SET "publishedAt"=NULL WHERE id=$1`, [
    eventIds[2],
  ]);
  assert.equal((await pages.resolve('/events/test-private-event')).status, 404);
  assert.equal((await pages.resolve('/clubs/test-private-club')).status, 404);
  for (const code of ['PRIVATE1', 'PRIVATE2'])
    assert.equal((await pages.resolve('/competitions/' + code)).status, 404);
  const event = await pages.resolve('/events/test-public-event');
  assert.equal(event.indexable, true);
  assert.ok(event.jsonLd.some((s) => s['@type'] === 'Event'));
  assert.ok(event.body.includes('Get Pass'));
  assert.equal((await pages.resolve('/competitions/PUBLIC01')).indexable, true);
  assert.equal(
    (await pages.resolve('/running-clubs/in/test-location')).indexable,
    true,
  );
  assert.equal(
    (await pages.resolve('/running-events/in/test-location')).status,
    404,
  );
  for (const hub of [
    '/events',
    '/competitions',
    '/running-events',
    '/running-clubs',
    '/step-challenges',
    '/virtual-fitness-challenges',
  ])
    assert.equal((await pages.resolve(hub)).status, 200);
  for (const shard of [
    'static.xml',
    'events-1.xml',
    'clubs-1.xml',
    'competitions-1.xml',
  ]) {
    const xml = await pages.sitemapShard(shard);
    assert.ok(xml);
    assert.ok(!xml.includes('PRIVATE'));
    assert.ok(!xml.includes('test-private'));
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.equal(new Set(urls).size, urls.length);
    for (const url of urls) {
      const page = await pages.resolve(new URL(url).pathname);
      assert.equal(page.status, 200, url);
      assert.equal(page.indexable, true, url);
    }
  }
  await query(`UPDATE club_events SET "deletedAt"=now() WHERE id=$1`, [
    eventIds[0],
  ]);
  assert.equal((await pages.resolve('/events/test-public-event')).status, 410);
  assert.ok(
    !(await pages.sitemapShard('events-1.xml')).includes('test-public-event'),
  );
  await query(`UPDATE club_events SET "publishedAt"=now() WHERE id=$1`, [
    eventIds[2],
  ]);
  const inviteHostEvent = await pages.resolve('/events/test-private-event');
  assert.equal(inviteHostEvent.indexable, true);
  assert.ok(!inviteHostEvent.body.includes('href="/clubs/test-private-club'));
  assert.ok(
    (await pages.sitemapShard('events-1.xml')).includes('test-private-event'),
  );
  assert.equal((await pages.resolve('/clubs/test-private-club')).status, 404);
  await new OrganicAcquisition1793550000000().up({ query: (s) => pg.exec(s) });
  await query(
    `INSERT INTO organic_acquisition_events(session,source,landing,kind,"dedupeKey") VALUES($1,'google','/business','landing','same') ON CONFLICT DO NOTHING`,
    [ids[0]],
  );
  await query(
    `INSERT INTO organic_acquisition_events(session,source,landing,kind,"dedupeKey") VALUES($1,'google','/business','landing','same') ON CONFLICT DO NOTHING`,
    [ids[0]],
  );
  assert.equal(
    (
      await query(
        'SELECT count(*)::int AS count FROM organic_acquisition_events',
      )
    )[0].count,
    1,
  );
  await new OrganicAcquisition1793550000000().down({
    query: (s) => pg.exec(s),
  });
  console.log(
    'PASS: real scheduling SQL, private/deleted filters, public HTML/schema, live sitemap eligibility, canonical targets, location gating and analytics migration/idempotency',
  );
}
module.exports = { run };
if (require.main === module)
  (async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error(
        'Set TEST_DATABASE_URL to disposable PostgreSQL; build apps/api first.',
      );
    const { Client } = require('../apps/api/node_modules/pg');
    const client = new Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await client.connect();
    const schema = 'jump_seo_validation_' + process.pid;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}",public`);
    try {
      await run({
        query: (s, p) => client.query(s, p),
        exec: (s) => client.query(s),
      });
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
