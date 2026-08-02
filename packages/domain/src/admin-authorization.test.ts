import { describe, expect, it } from 'vitest';
import { canManageAdmins, resolveInviteOnlyAccess, wouldLeaveAppWithoutAdmin } from './admin-authorization.js';

describe('canManageAdmins', () => {
  it('only admins may manage other admins', () => {
    expect(canManageAdmins(true)).toBe(true);
    expect(canManageAdmins(false)).toBe(false);
  });
});

describe('wouldLeaveAppWithoutAdmin', () => {
  it('blocks demoting the last active admin', () => {
    expect(wouldLeaveAppWithoutAdmin(0, true)).toBe(true);
  });

  it('allows demotion when other admins remain', () => {
    expect(wouldLeaveAppWithoutAdmin(1, true)).toBe(false);
  });

  it('is irrelevant for accounts that are not currently admins', () => {
    expect(wouldLeaveAppWithoutAdmin(0, false)).toBe(false);
  });
});

describe('resolveInviteOnlyAccess', () => {
  it('uses the admin override when set', () => {
    expect(resolveInviteOnlyAccess(false, true)).toBe(true);
    expect(resolveInviteOnlyAccess(true, false)).toBe(false);
  });

  it('falls back to the env default when there is no override', () => {
    expect(resolveInviteOnlyAccess(false, null)).toBe(false);
    expect(resolveInviteOnlyAccess(true, null)).toBe(true);
  });
});
