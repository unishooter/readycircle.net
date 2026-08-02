import { and, eq } from 'drizzle-orm';
import { userIdentities, users, type Database } from '@readycircle/database';

export interface ProviderIdentityInput {
  provider: 'google' | 'apple' | 'email_password' | 'dev';
  providerSubject: string;
  providerEmail?: string | null;
  emailVerified: boolean;
  displayName: string;
}

/**
 * Resolves a verified external-provider identity to an internal user,
 * creating the user on first sign-in. This is the mapping described in the
 * identity design (user_id / provider / provider_subject / provider_email
 * / email_verified) and is shared by every real `AuthProvider`
 * implementation so identity resolution logic only exists once.
 *
 * Account linking: if no `(provider, providerSubject)` row matches but a
 * *verified* email matches an existing user (e.g. someone signed up with
 * Google, and later uses "Continue with email" using the same address, or
 * vice versa), the new identity is linked to that existing user instead of
 * creating a duplicate account. This relies on `users.email` having a
 * unique index (see `packages/database/src/schema/identity.ts`) and on the
 * caller only ever passing `emailVerified: true` for addresses a real
 * identity provider has actually confirmed -- an unverified email must
 * never be used to hijack an existing account.
 */
/**
 * Cheap existence check for the invite-only sign-up gate: does this exact
 * `(provider, providerSubject)` already map to a user? Deliberately does
 * *not* fall back to the verified-email account-linking check that
 * `findOrCreateUserByProviderIdentity` performs -- the gate only needs to
 * know "would calling that function create a brand-new row", and checking
 * only the identity row keeps this a single indexed lookup with no side
 * effects.
 */
export async function hasProviderIdentity(
  db: Database,
  provider: ProviderIdentityInput['provider'],
  providerSubject: string,
): Promise<boolean> {
  const [existing] = await db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(and(eq(userIdentities.provider, provider), eq(userIdentities.providerSubject, providerSubject)))
    .limit(1);
  return Boolean(existing);
}

export async function findOrCreateUserByProviderIdentity(
  db: Database,
  input: ProviderIdentityInput,
): Promise<{ userId: string; isNewUser: boolean }> {
  const [existingIdentity] = await db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(and(eq(userIdentities.provider, input.provider), eq(userIdentities.providerSubject, input.providerSubject)))
    .limit(1);

  if (existingIdentity) {
    return { userId: existingIdentity.userId, isNewUser: false };
  }

  if (input.providerEmail && input.emailVerified) {
    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.providerEmail)).limit(1);
    if (existingUser) {
      await db.insert(userIdentities).values({
        userId: existingUser.id,
        provider: input.provider,
        providerSubject: input.providerSubject,
        providerEmail: input.providerEmail,
        emailVerified: input.emailVerified,
      });
      return { userId: existingUser.id, isNewUser: false };
    }
  }

  // `users.email` is only ever populated with a *verified* address (it has
  // a unique index and doubles as the account-linking key above), so an
  // unverified email is recorded on the identity row only, never here --
  // otherwise it could collide with, or later be mistaken for, someone
  // else's already-verified address on that same string.
  const storedEmail = input.emailVerified ? (input.providerEmail ?? null) : null;

  const [user] = await db
    .insert(users)
    .values({
      displayName: input.displayName,
      email: storedEmail,
      emailVerified: input.emailVerified,
    })
    .returning();

  if (!user) throw new Error('Failed to create user during identity mapping.');

  await db.insert(userIdentities).values({
    userId: user.id,
    provider: input.provider,
    providerSubject: input.providerSubject,
    providerEmail: input.providerEmail ?? null,
    emailVerified: input.emailVerified,
  });

  return { userId: user.id, isNewUser: true };
}
