import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { circleRoles } from './schema/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run migrations.');
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log('Ensuring PostGIS extension is available...');
  await client.unsafe('CREATE EXTENSION IF NOT EXISTS postgis');

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: path.join(__dirname, '..', 'drizzle') });

  console.log('Ensuring core reference data (Circle role catalog)...');
  await db
    .insert(circleRoles)
    .values([
      { key: 'coordinator', label: 'Circle coordinator' },
      { key: 'member', label: 'Member' },
    ])
    .onConflictDoNothing({ target: circleRoles.key });

  await client.end();
  console.log('Migrations complete.');
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
