import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, deleteTestCircle, deleteTestUser, loginAsNewDevUser, type TestContext, type TestUser } from '../../test/helpers.js';

function stationPayload(name: string) {
  return {
    name,
    stationType: 'home',
    location: { areaLabel: 'Test Area', precision: 'broad_area' },
    capabilities: ['frs'],
    experienceLevel: 'new',
    authorization: 'frs_user',
    visibility: 'circle',
  };
}

async function createStation(ctx: TestContext, user: TestUser, name: string): Promise<string> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/stations',
    cookies: { rc_session: user.sessionToken },
    payload: stationPayload(name),
  });
  return response.json().id;
}

describe('invites API', () => {
  let ctx: TestContext;
  let coordinator: TestUser;
  let member: TestUser;
  let invitee: TestUser;
  let outsider: TestUser;
  let coordinatorStationId: string;
  let memberStationId: string;
  let circleId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    coordinator = await loginAsNewDevUser(ctx.app, 'Invite Coordinator');
    member = await loginAsNewDevUser(ctx.app, 'Invite Member');
    invitee = await loginAsNewDevUser(ctx.app, 'Invite Invitee');
    outsider = await loginAsNewDevUser(ctx.app, 'Invite Outsider');

    coordinatorStationId = await createStation(ctx, coordinator, "Coordinator's Station");
    memberStationId = await createStation(ctx, member, "Member's Station");

    const circleResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        circleType: 'neighborhood',
        name: 'Invite Test Circle',
        area: { areaLabel: 'Test Area' },
        creatorStationId: coordinatorStationId,
      },
    });
    circleId = circleResponse.json().id;

    // A station can only be added to a Circle by its own owner, so this
    // must use `member`'s session (not the coordinator's) even though the
    // coordinator's Circle is the target.
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: member.sessionToken },
      payload: { stationId: memberStationId },
    });
  });

  afterAll(async () => {
    // Delete the Circle first -- it cascades to memberships and invites,
    // which otherwise block deleting the users referenced by
    // `circle_invitations.invited_by` (NOT NULL, no cascade by design).
    await deleteTestCircle(ctx.db, circleId);
    await deleteTestUser(ctx.db, coordinator.userId);
    await deleteTestUser(ctx.db, member.userId);
    await deleteTestUser(ctx.db, invitee.userId);
    await deleteTestUser(ctx.db, outsider.userId);
    await ctx.close();
  });

  it('rejects a non-member from creating an invite', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/invites`,
      cookies: { rc_session: outsider.sessionToken },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets any active member (not just coordinators) create an invite', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/invites`,
      cookies: { rc_session: member.sessionToken },
      payload: { note: 'for testing' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.note).toBe('for testing');
    expect(body.status).toBe('pending');
    expect(body.inviteUrl).toContain('/invite/');
  });

  it('previews a valid invite publicly, without authentication', async () => {
    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/invites`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {},
    });
    const token = (createResponse.json().inviteUrl as string).split('/invite/')[1];

    const previewResponse = await ctx.app.inject({ method: 'GET', url: `/api/v1/invites/${token}` });
    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json()).toMatchObject({ valid: true, circleName: 'Invite Test Circle' });
  });

  it('reports an invalid/not-found token as invalid', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/invites/not-a-real-token' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ valid: false, reason: 'not_found' });
  });

  it('accepts an invite by joining the Circle with a new station, and the token becomes single-use', async () => {
    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/invites`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {},
    });
    const token = (createResponse.json().inviteUrl as string).split('/invite/')[1];

    const inviteeStationId = await createStation(ctx, invitee, "Invitee's Station");

    const acceptResponse = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/invites/${token}/accept`,
      cookies: { rc_session: invitee.sessionToken },
      payload: { stationId: inviteeStationId },
    });
    expect(acceptResponse.statusCode).toBe(200);
    expect(acceptResponse.json().status).toBe('accepted');

    const membersResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(membersResponse.json().items.some((m: { stationId: string }) => m.stationId === inviteeStationId)).toBe(
      true,
    );

    // Single-use: accepting again with the same token must fail.
    const secondStationId = await createStation(ctx, invitee, "Invitee's Second Station");
    const secondAcceptResponse = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/invites/${token}/accept`,
      cookies: { rc_session: invitee.sessionToken },
      payload: { stationId: secondStationId },
    });
    expect(secondAcceptResponse.statusCode).toBe(409);
  });

  it('rejects accepting an invite with a station the caller does not own', async () => {
    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/invites`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {},
    });
    const token = (createResponse.json().inviteUrl as string).split('/invite/')[1];

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/invites/${token}/accept`,
      cookies: { rc_session: invitee.sessionToken },
      payload: { stationId: memberStationId }, // owned by `member`, not `invitee`
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets a member revoke a pending invite, after which it can no longer be accepted', async () => {
    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/invites`,
      cookies: { rc_session: member.sessionToken },
      payload: {},
    });
    const inviteId = createResponse.json().id;
    const token = (createResponse.json().inviteUrl as string).split('/invite/')[1];

    const revokeResponse = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circle-invites/${inviteId}/revoke`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json().status).toBe('revoked');

    const previewResponse = await ctx.app.inject({ method: 'GET', url: `/api/v1/invites/${token}` });
    expect(previewResponse.json()).toMatchObject({ valid: false, reason: 'revoked' });
  });

  it('lists invites for a Circle to any active member', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/invites`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json().items)).toBe(true);
    expect(response.json().items.length).toBeGreaterThan(0);
  });
});
