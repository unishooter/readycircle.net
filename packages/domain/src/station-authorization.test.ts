import { describe, expect, it } from 'vitest';
import { canAddStationToCircle, canArchiveStation, canEditStation, canViewStation } from './station-authorization.js';

describe('canViewStation', () => {
  it('always allows the owner', () => {
    expect(canViewStation({ isOwner: true, sharesCircleWithViewer: false, isCoordinatorOfSharedCircle: false }, 'private')).toBe(true);
  });

  it('denies non-owners for private stations', () => {
    expect(canViewStation({ isOwner: false, sharesCircleWithViewer: true, isCoordinatorOfSharedCircle: true }, 'private')).toBe(false);
  });

  it('allows circle members for circle visibility', () => {
    expect(canViewStation({ isOwner: false, sharesCircleWithViewer: true, isCoordinatorOfSharedCircle: false }, 'circle')).toBe(true);
    expect(canViewStation({ isOwner: false, sharesCircleWithViewer: false, isCoordinatorOfSharedCircle: false }, 'circle')).toBe(false);
  });

  it('restricts coordinators-only visibility to coordinators', () => {
    expect(canViewStation({ isOwner: false, sharesCircleWithViewer: true, isCoordinatorOfSharedCircle: false }, 'coordinators')).toBe(false);
    expect(canViewStation({ isOwner: false, sharesCircleWithViewer: true, isCoordinatorOfSharedCircle: true }, 'coordinators')).toBe(true);
  });

  it('does not expose discoverable_aggregate stations individually', () => {
    expect(canViewStation({ isOwner: false, sharesCircleWithViewer: true, isCoordinatorOfSharedCircle: true }, 'discoverable_aggregate')).toBe(false);
  });
});

describe('ownership predicates', () => {
  it('only allows owners to edit or archive', () => {
    expect(canEditStation(true)).toBe(true);
    expect(canEditStation(false)).toBe(false);
    expect(canArchiveStation(true)).toBe(true);
    expect(canArchiveStation(false)).toBe(false);
  });

  it('only allows the station owner to add it to a circle', () => {
    expect(canAddStationToCircle('user-1', 'user-1')).toBe(true);
    expect(canAddStationToCircle('user-1', 'user-2')).toBe(false);
  });
});
