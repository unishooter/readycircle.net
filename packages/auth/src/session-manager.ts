import { createHmac, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { sessions, type Database } from '@readycircle/database';

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export const SESSION_COOKIE_NAME = 'rc_session';

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

/**
 * Provider-agnostic session issuance and validation. Every `AuthProvider`
 * implementation (development or Cognito) ends its flow by handing a
 * resolved internal `userId` to this class -- it is the only thing that
 * ever creates the ReadyCircle session cookie, which keeps provider tokens
 * out of the browser entirely.
 */
export class SessionManager {
  constructor(
    private readonly db: Database,
    private readonly sessionSecret: string,
    private readonly sessionTtlMs: number = DEFAULT_SESSION_TTL_MS,
  ) {}

  private hashToken(token: string): string {
    return createHmac('sha256', this.sessionSecret).update(token).digest('hex');
  }

  async createSession(userId: string): Promise<CreatedSession> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.sessionTtlMs);
    await this.db.insert(sessions).values({ userId, tokenHash, expiresAt });
    return { token, expiresAt };
  }

  async validateSession(token: string): Promise<{ userId: string } | null> {
    const tokenHash = this.hashToken(token);
    const [row] = await this.db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
    if (!row) return null;
    if (row.expiresAt.getTime() < Date.now()) {
      await this.db.delete(sessions).where(eq(sessions.id, row.id));
      return null;
    }
    // Best-effort activity tracking; failures here should never break auth.
    void this.db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.id));
    return { userId: row.userId };
  }

  async revokeSession(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
}
