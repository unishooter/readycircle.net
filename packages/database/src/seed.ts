import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { eq, inArray } from 'drizzle-orm';
import { createDatabase } from './client.js';
import {
  circleMemberships,
  circleRoleAssignments,
  circleRoles,
  circles,
  stationCapabilities,
  stationLocations,
  stationPrivacy,
  stations,
  userIdentities,
  users,
} from './schema/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env') });

const SEED_EMAILS = ['ana@example.com', 'ben@example.com', 'cara@example.com'] as const;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed the database.');
  }

  const { db, close } = createDatabase(connectionString);

  console.log('Clearing previous seed data (idempotent re-seed)...');
  await db.delete(users).where(inArray(users.email, [...SEED_EMAILS]));

  console.log('Loading Circle role catalog (created by `pnpm db:migrate`)...');
  const [coordinatorRole] = await db.select().from(circleRoles).where(eq(circleRoles.key, 'coordinator'));
  const [memberRole] = await db.select().from(circleRoles).where(eq(circleRoles.key, 'member'));
  if (!coordinatorRole || !memberRole) {
    throw new Error('Circle role catalog is missing. Run `pnpm db:migrate` before seeding.');
  }

  console.log('Creating seed users and stations...');

  const [ana] = await db
    .insert(users)
    .values({
      displayName: 'Ana Beginner',
      email: 'ana@example.com',
      emailVerified: true,
      devPersona: 'Beginner user, new to radio',
    })
    .returning();
  const [ben] = await db
    .insert(users)
    .values({
      displayName: 'Ben Ramirez',
      email: 'ben@example.com',
      emailVerified: true,
      devPersona: 'Experienced relay operator',
    })
    .returning();
  const [cara] = await db
    .insert(users)
    .values({
      displayName: 'Cara Coordinator',
      email: 'cara@example.com',
      emailVerified: true,
      devPersona: 'Circle coordinator',
    })
    .returning();

  if (!ana || !ben || !cara) throw new Error('Failed to create seed users.');

  await db.insert(userIdentities).values([
    { userId: ana.id, provider: 'dev', providerSubject: ana.id, providerEmail: ana.email, emailVerified: true },
    { userId: ben.id, provider: 'dev', providerSubject: ben.id, providerEmail: ben.email, emailVerified: true },
    { userId: cara.id, provider: 'dev', providerSubject: cara.id, providerEmail: cara.email, emailVerified: true },
  ]);

  const [anaStation] = await db
    .insert(stations)
    .values({
      ownerId: ana.id,
      name: "Ana's Home Station",
      stationType: 'home',
      experienceLevel: 'new',
      authorization: 'frs_user',
      goals: ['nearby_family_communication', 'receive_emergency_information'],
      participatesInScheduledChecks: true,
    })
    .returning();

  const [benStation] = await db
    .insert(stations)
    .values({
      ownerId: ben.id,
      name: "Ben's Go-Kit",
      stationType: 'portable',
      experienceLevel: 'experienced',
      authorization: 'amateur_general',
      goals: ['serve_as_relay', 'practice_radio_skills', 'support_organization'],
      participatesInScheduledChecks: true,
      willingToRelay: true,
      willingToActAsNetControl: true,
    })
    .returning();

  const [caraStation] = await db
    .insert(stations)
    .values({
      ownerId: cara.id,
      name: "Cara's Church Station",
      stationType: 'organization',
      experienceLevel: 'comfortable',
      authorization: 'gmrs_license',
      goals: ['support_organization', 'neighborhood_welfare_checks'],
      participatesInScheduledChecks: true,
      willingToActAsNetControl: true,
    })
    .returning();

  if (!anaStation || !benStation || !caraStation) throw new Error('Failed to create seed stations.');

  await db.insert(stationLocations).values([
    {
      stationId: anaStation.id,
      areaLabel: 'Maple Street neighborhood',
      precision: 'broad_area',
      locationSource: 'manual',
    },
    {
      stationId: benStation.id,
      areaLabel: 'Riverside district',
      // Realistic-looking 1km MGRS code, for consistency with the format
      // the API now derives server-side from real coordinates (see
      // @readycircle/geo). This seed row bypasses that derivation --
      // writing straight to the DB, not through the API -- so it's a
      // cosmetic sample value only, not tied to an actual coordinate.
      gridIdentifier: '16SBK7308',
      precision: 'one_km_grid',
      locationSource: 'manual',
    },
    {
      stationId: caraStation.id,
      areaLabel: 'Downtown Springfield',
      precision: 'broad_area',
      locationSource: 'manual',
    },
  ]);

  await db.insert(stationPrivacy).values([
    { stationId: anaStation.id, visibility: 'circle' },
    { stationId: benStation.id, visibility: 'circle' },
    { stationId: caraStation.id, visibility: 'coordinators' },
  ]);

  await db.insert(stationCapabilities).values([
    { stationId: anaStation.id, capability: 'frs' },
    { stationId: benStation.id, capability: 'amateur' },
    { stationId: benStation.id, capability: 'gmrs' },
    { stationId: caraStation.id, capability: 'gmrs' },
    { stationId: caraStation.id, capability: 'amateur' },
  ]);

  console.log('Creating seed Radio Circle...');

  const [circle] = await db
    .insert(circles)
    .values({
      circleType: 'neighborhood',
      name: 'Springfield North Side Circle',
      shortDescription: 'Neighbors staying in touch when phones and internet are down.',
      purpose:
        'Coordinate welfare checks and share local information among Maple Street and Riverside households.',
      areaLabel: 'Springfield - North Side',
      gridOrLocalityLabel: 'FN20',
      isPrivate: true,
      requiresApproval: true,
      memberSharingPolicy: 'coordinators_only',
      createdBy: cara.id,
    })
    .returning();

  if (!circle) throw new Error('Failed to create seed Circle.');

  const [caraMembership] = await db
    .insert(circleMemberships)
    .values({ circleId: circle.id, stationId: caraStation.id, userId: cara.id })
    .returning();
  const [anaMembership] = await db
    .insert(circleMemberships)
    .values({ circleId: circle.id, stationId: anaStation.id, userId: ana.id })
    .returning();
  const [benMembership] = await db
    .insert(circleMemberships)
    .values({ circleId: circle.id, stationId: benStation.id, userId: ben.id })
    .returning();

  if (!caraMembership || !anaMembership || !benMembership) {
    throw new Error('Failed to create seed memberships.');
  }

  await db.insert(circleRoleAssignments).values([
    { membershipId: caraMembership.id, roleId: coordinatorRole.id },
    { membershipId: anaMembership.id, roleId: memberRole.id },
    { membershipId: benMembership.id, roleId: memberRole.id },
  ]);

  await close();

  console.log('\nSeed complete. Development accounts:');
  console.log('  - Ana Beginner   (ana@example.com)  - beginner user');
  console.log('  - Ben Ramirez    (ben@example.com)  - experienced relay operator');
  console.log('  - Cara Coordinator (cara@example.com) - Circle coordinator');
}

main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
