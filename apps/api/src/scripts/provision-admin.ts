/**
 * Provision an admin for admin.startajump.com, by email. They sign in there with a one-time code sent
 * to that address; there is no admin password.
 *
 *   npm run admin:provision -- someone@startajump.com            make them an admin
 *   npm run admin:provision -- someone@startajump.com compliance  reviews and read-only money views
 *   npm run admin:provision -- someone@startajump.com remove      back to a normal runner
 *   npm run admin:provision -- list                              who has access
 *
 * An address with no Jump account gets a bare one (verified, no usable password) just for the console.
 */
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import dataSource from '../database/data-source';

async function main() {
  const [email, action = 'admin'] = process.argv.slice(2);
  if (!email) throw new Error('Usage: admin:provision <email> [admin|compliance|remove] | list');
  await dataSource.initialize();
  try {
    if (email === 'list') {
      const admins = await dataSource.query(`SELECT "email", "role", "lastSeenAt" FROM "users" WHERE "role" IN ('admin','compliance') ORDER BY "email"`);
      console.table(admins);
      return;
    }
    if (!['admin', 'compliance', 'remove'].includes(action)) throw new Error(`Unknown action "${action}"`);
    const address = email.trim().toLowerCase();
    const [existing] = await dataSource.query(`SELECT "id", "role" FROM "users" WHERE lower("email") = $1`, [address]) as Array<{ id: string; role: string }>;
    if (action === 'remove') {
      if (!existing) throw new Error(`No account for ${address}`);
      await dataSource.query(`UPDATE "users" SET "role" = 'runner' WHERE "id" = $1`, [existing.id]);
      // Their open admin console sessions end now.
      await dataSource.query(`UPDATE "auth_sessions" SET "revokedAt" = now() WHERE "userId" = $1 AND "scope" = 'admin' AND "revokedAt" IS NULL`, [existing.id]);
      console.log(`${address} is no longer an admin.`);
      return;
    }
    if (existing) {
      await dataSource.query(`UPDATE "users" SET "role" = $2, "emailVerified" = true WHERE "id" = $1`, [existing.id, action]);
      console.log(`${address} is now ${action} (was ${existing.role}).`);
    } else {
      const unusable = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      await dataSource.query(
        `INSERT INTO "users" ("email", "passwordHash", "displayName", "role", "emailVerified") VALUES ($1, $2, $3, $4, true)`,
        [address, unusable, address.split('@')[0], action],
      );
      console.log(`Created ${address} as ${action}.`);
    }
    console.log('They sign in at https://admin.startajump.com with a code sent to that address.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
