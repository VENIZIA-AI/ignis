import 'dotenv-flow/config';

import { LoggerFactory } from '@venizia/ignis-helpers';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { Note } from './models/entities/note.model';

const logger = LoggerFactory.getLogger(['seed']);

/**
 * Seeds notes for real `auth.users` rows.
 *
 * Runs as the connection's own role (the table owner), NOT as `authenticated` - so RLS does not
 * apply and `ownerId` must be supplied explicitly. That is the whole difference between this script
 * and the application: the app never states an owner, because inside a transaction carrying auth
 * context the database already knows who is asking.
 */
const seed = async () => {
  const url = process.env.APP_ENV_SUPABASE_DATABASE_URL;

  if (!url) {
    logger.error('[seed] Missing APP_ENV_SUPABASE_DATABASE_URL');
    process.exit(1);
  }

  const client = postgres(url, { prepare: false, max: 1 });
  const connector = drizzle({ client, schema: { note: Note.schema } });

  const users = await connector.execute<{ id: string; email: string }>(
    sql`select id, email from auth.users order by created_at limit 2`,
  );

  if (users.length < 2) {
    logger.error('[seed] Need at least 2 rows in auth.users | Found: %s', users.length);
    await client.end();
    process.exit(1);
  }

  await connector.delete(Note.schema);

  const rows = users.flatMap(user => [
    {
      ownerId: user.id,
      title: `${user.email} - private note`,
      content: 'Visible to its owner only, and only because of RLS.',
      isPrivate: true,
    },
    {
      ownerId: user.id,
      title: `${user.email} - second note`,
      content: 'The policy does not care how many rows there are.',
      isPrivate: false,
    },
  ]);

  await connector.insert(Note.schema).values(rows);

  logger.info(
    '[seed] Seeded %s notes across %s users | Users: %s',
    rows.length,
    users.length,
    users.map(user => `${user.email} (${user.id})`).join(', '),
  );

  await client.end();
};

seed().catch(error => {
  logger.error('[seed] Failed | Error: %s', error);
  process.exit(1);
});
