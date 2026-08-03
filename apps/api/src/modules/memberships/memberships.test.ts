import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, deleteTestUser, loginAsNewDevUser, type TestContext, type TestUser } from '../../test/helpers.js';

function stationPayload(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    stationType: 'home',
    location: { areaLabel: 'Test Area', precision: 'one_km_grid', latitude: 40.1, longitude: -88.2 },
    capabilities: ['frs'],
    experienceLevel: 'comfortable',
    authorization: 'frs_user',
    visibility: 'circle',
    ...extra,
  };
}

async function createStation(ctx: TestContext, user: TestUser, name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/stations',
    cookies: { rc_session: user.sessionToken },
    payload: stationPayload(name, extra),
  });
  return response.json().id;
}

describe('memberships API', () => {
  let ctx: TestContext;
  let coordinator: TestUser;
  let member: TestUser;
  let nonmember: TestUser;
  let coordinatorStationId: string;
  let memberStationId: string;
  let circleId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    coordinator = await loginAsNewDevUser(ctx.app, 'Membership Coordinator');
    member = await loginAsNewDevUser(ctx.app, 'Membership Member');
    nonmember = await loginAsNewDevUser(ctx.app, 'Membership Nonmember');

    coordinatorStationId = await createStation(ctx, coordinator, "Coordinator's Station");
    memberStationId = await createStation(ctx, member, "Member's Station");

    const circleResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        circleType: 'neighborhood',
        name: 'Membership Test Circle',
        area: { areaLabel: 'Test Area' },
        creatorStationId: coordinatorStationId,
      },
    });
    circleId = circleResponse.json().id;
  });

  afterAll(async () => {
    await deleteTestUser(ctx.db, coordinator.userId);
    await deleteTestUser(ctx.db, member.userId);
    await deleteTestUser(ctx.db, nonmember.userId);
    await ctx.close();
  });

  it('rejects nonmembers from listing members', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: nonmember.sessionToken },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects adding a station the caller does not own', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: { stationId: memberStationId }, // owned by `member`, requested by `coordinator`... but coordinator is a circle coordinator, not the station owner
    });
    expect(response.statusCode).toBe(403);
  });

  it("adds the member's own station to the Circle", async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: member.sessionToken },
      payload: { stationId: memberStationId },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.role).toBe('member');
    expect(body.stationId).toBe(memberStationId);
  });

  it("shares only the contact fields a member has marked visible to their Circles", async () => {
    const initialResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    const items: { stationId: string; memberDisplayName: string; contact: unknown }[] = initialResponse.json().items;
    const initialRow = items.find((m) => m.stationId === memberStationId);
    expect(initialRow?.memberDisplayName).toBe('Membership Member');
    expect(initialRow?.contact).toEqual({ email: null, phone: null, address: null });

    const updateResponse = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      cookies: { rc_session: member.sessionToken },
      payload: { phone: '555-0199', address: '99 Birch Ln', phoneVisibleToCircle: true },
    });
    expect(updateResponse.statusCode).toBe(200);

    const updatedResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    const updatedItems: { stationId: string; contact: { email: string | null; phone: string | null; address: string | null } }[] =
      updatedResponse.json().items;
    const updatedRow = updatedItems.find((m) => m.stationId === memberStationId);
    // Phone was marked visible and has a value; address has a value but was never marked visible.
    expect(updatedRow?.contact).toEqual({ email: null, phone: '555-0199', address: null });
  });

  it('shapes a fellow Circle member\'s station without precise coordinates, even at one_km_grid precision', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stations/${memberStationId}`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.isOwner).toBe(false);
    expect(body.location.latitude).toBeNull();
    expect(body.location.longitude).toBeNull();
    // Server-derived 1km MGRS code for (40.1, -88.2) -- see packages/geo.
    expect(body.location.gridIdentifier).toBe('16TCK9739');
  });

  it('still rejects a true nonmember from viewing a circle-visible station', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stations/${memberStationId}`,
      cookies: { rc_session: nonmember.sessionToken },
    });
    expect(response.statusCode).toBe(403);
  });

  it('prevents removing the last active coordinator', async () => {
    const membersResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    const coordinatorMembership = membersResponse
      .json()
      .items.find((m: { role: string }) => m.role === 'coordinator');
    expect(coordinatorMembership).toBeDefined();

    const removeResponse = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/circles/${circleId}/members/${coordinatorMembership.id}`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(removeResponse.statusCode).toBe(409);
  });

  it('allows promoting a member to coordinator, then permits removing the original coordinator', async () => {
    const membersResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    const items = membersResponse.json().items as { id: string; role: string; stationId: string }[];
    const memberMembership = items.find((m) => m.stationId === memberStationId)!;
    const coordinatorMembership = items.find((m) => m.role === 'coordinator')!;

    const promoteResponse = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/circles/${circleId}/members/${memberMembership.id}`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: { role: 'coordinator' },
    });
    expect(promoteResponse.statusCode).toBe(200);
    expect(promoteResponse.json().role).toBe('coordinator');

    const removeResponse = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/circles/${circleId}/members/${coordinatorMembership.id}`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(removeResponse.statusCode).toBe(200);
    expect(removeResponse.json().status).toBe('removed');
  });
});
