import type { Database } from '@readycircle/database';
import type { CurrentUser, UpdateCurrentUserInput } from '@readycircle/contracts';
import { NotFoundError } from '../../lib/errors.js';
import type { AuditService } from '../audit/service.js';
import { getCurrentUserById, updateUserDisplayName } from './repository.js';

export class UserService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async getMe(userId: string): Promise<CurrentUser> {
    const user = await getCurrentUserById(this.db, userId);
    if (!user) throw new NotFoundError('User not found.');
    return user;
  }

  async updateMe(userId: string, input: UpdateCurrentUserInput, requestId: string): Promise<CurrentUser> {
    if (input.displayName !== undefined) {
      await updateUserDisplayName(this.db, userId, input.displayName);
    }
    await this.audit.record({
      actorUserId: userId,
      action: 'user.profile_updated',
      targetType: 'user',
      targetId: userId,
      requestId,
      metadata: { fields: Object.keys(input) },
    });
    return this.getMe(userId);
  }
}
