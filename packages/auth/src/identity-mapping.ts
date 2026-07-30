import { and, eq } from 'drizzle-orm';
import { userIdentities, users, type Database } from '@readycircle/database';

export interface ProviderIdentityInput {
  provider: 'google' | 'apple' | 'email_magic_link' | 'dev';
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
 */
export async function findOrCreateUserByProviderIdentity(
  db: Database,
  input: ProviderIdentityInput,
): Promise<{ userId: string; isNewUser: boolean }> {
  const [existing] = await db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(and(eq(userIdentities.provider, input.provider), eq(userIdentities.providerSubject, input.providerSubject)))
    .limit(1);

  if (existing) {
    return { userId: existing.userId, isNewUser: false };
  }

  const [user] = await db
    .insert(users)
    .values({
      displayName: input.displayName,
      email: input.providerEmail ?? null,
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
