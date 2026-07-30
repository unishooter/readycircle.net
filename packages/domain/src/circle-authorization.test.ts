import { describe, expect, it } from 'vitest';
import { canEditCircle, canManageMembers, canViewCircle, wouldLeaveCircleWithoutCoordinator } from './circle-authorization.js';

describe('circle role predicates', () => {
  it('only coordinators may edit or manage members', () => {
    expect(canEditCircle('coordinator')).toBe(true);
    expect(canEditCircle('member')).toBe(false);
    expect(canManageMembers('coordinator')).toBe(true);
    expect(canManageMembers('member')).toBe(false);
  });

  it('nonmembers cannot view circle details', () => {
    expect(canViewCircle(null)).toBe(false);
    expect(canViewCircle('member')).toBe(true);
  });
});

describe('wouldLeaveCircleWithoutCoordinator', () => {
  it('blocks removing the last active coordinator', () => {
    expect(wouldLeaveCircleWithoutCoordinator(0, true)).toBe(true);
  });

  it('allows removal when other coordinators remain', () => {
    expect(wouldLeaveCircleWithoutCoordinator(1, true)).toBe(false);
  });

  it('is irrelevant for non-coordinators', () => {
    expect(wouldLeaveCircleWithoutCoordinator(0, false)).toBe(false);
  });
});
