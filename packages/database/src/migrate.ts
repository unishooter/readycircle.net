import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { backfillCircleIdentifiers, finalizeCircleIdentifierNotNull } from './backfill-circle-identifiers.js';
import { createManagedDatabase } from './client.js';
import { circleRoles } from './schema/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  const secretArn = process.env.DATABASE_SECRET_ARN?.trim() || null;
  const connectionString = process.env.DATABASE_URL?.trim() || null;
  const region = process.env.AWS_REGION?.trim() || 'us-east-1';

  if (!secretArn && !connectionString) {
    throw new Error('DATABASE_SECRET_ARN or DATABASE_URL is required to run migrations.');
  }

  const { db, client, close } = await createManagedDatabase({
    secretArn,
    connectionString,
    region,
    max: 1,
  });

  console.log(
    secretArn
      ? `Ensuring PostGIS extension is available (Secrets Manager: ${secretArn})...`
      : 'Ensuring PostGIS extension is available...',
  );
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

  console.log('Backfilling Circle Identifiers for existing circles...');
  const { updated } = await backfillCircleIdentifiers(db);
  console.log(`Assigned Circle Identifiers to ${updated} circle(s).`);
  await finalizeCircleIdentifierNotNull(db);

  await close();
  console.log('Migrations complete.');
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
