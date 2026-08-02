import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, deleteTestUser, loginAsNewDevUser, type TestContext, type TestUser } from '../../test/helpers.js';

function stationPayload(name: string, extras: Record<string, unknown> = {}) {
  return {
    name,
    stationType: 'home',
    location: { areaLabel: 'Test Area', precision: 'broad_area' },
    capabilities: ['frs'],
    experienceLevel: 'new',
    authorization: 'frs_user',
    visibility: 'circle',
    ...extras,
  };
}

const netPayload = {
  name: 'Sunday Evening Net',
  channel: 'FRS channel 3 (462.6125 MHz)',
  schedule: {
    frequency: 'weekly',
    firstOccursOn: '2026-08-02',
    timeLocal: '19:00',
    timezone: 'America/Chicago',
    durationMinutes: 30,
  },
  procedure: ['Net control opens the net', 'Stations check in by name'],
};

describe('nets API', () => {
  let ctx: TestContext;
  let coordinator: TestUser;
  let member: TestUser;
  let netControlMember: TestUser;
  let outsider: TestUser;
  let coordinatorStationId: string;
  let memberStationId: string;
  let netControlStationId: string;
  let circleId: string;
  let netId: string;

  async function createStation(user: TestUser, name: string, extras: Record<string, unknown> = {}) {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: user.sessionToken },
      payload: stationPayload(name, extras),
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  beforeAll(async () => {
    ctx = await createTestContext();
    coordinator = await loginAsNewDevUser(ctx.app, 'Net Coordinator');
    member = await loginAsNewDevUser(ctx.app, 'Net Member');
    netControlMember = await loginAsNewDevUser(ctx.app, 'Net Control Member');
    outsider = await loginAsNewDevUser(ctx.app, 'Net Outsider');

    coordinatorStationId = await createStation(coordinator, 'Coordinator Base');
    memberStationId = await createStation(member, 'Member Handheld');
    netControlStationId = await createStation(netControlMember, 'Net Control Rig', {
      willingToActAsNetControl: true,
    });

    const circleResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        circleType: 'neighborhood',
        name: 'Net Test Circle',
        area: { areaLabel: 'Testville' },
        creatorStationId: coordinatorStationId,
      },
    });
    circleId = circleResponse.json().id;

    for (const [user, stationId] of [
      [member, memberStationId],
      [netControlMember, netControlStationId],
    ] as const) {
      const joinResponse = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/circles/${circleId}/members`,
        cookies: { rc_session: user.sessionToken },
        payload: { stationId },
      });
      expect(joinResponse.statusCode).toBe(201);
    }
  });

  afterAll(async () => {
    for (const user of [coordinator, member, netControlMember, outsider]) {
      await deleteTestUser(ctx.db, user.userId);
    }
    await ctx.close();
  });

  it('lets a coordinator create a net with computed upcoming occurrences', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/nets`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: netPayload,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    netId = body.id;
    expect(body.schedule.frequencyLabel).toBe('Weekly');
    expect(body.nextOccurrences).toHaveLength(3);
    expect(body.viewerCanManage).toBe(true);
    expect(body.viewerCanRunSession).toBe(true);
  });

  it('rejects net creation by a non-coordinator member', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/nets`,
      cookies: { rc_session: member.sessionToken },
      payload: netPayload,
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects an unknown timezone', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/nets`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: { ...netPayload, schedule: { ...netPayload.schedule, timezone: 'Not/AZone' } },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a sourcePlanVersionId that is not a plan of this Circle', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/nets`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: { ...netPayload, sourcePlanVersionId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('hides the net from non-members', async () => {
    const detail = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/nets/${netId}`,
      cookies: { rc_session: outsider.sessionToken },
    });
    expect(detail.statusCode).toBe(403);

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/nets',
      cookies: { rc_session: outsider.sessionToken },
    });
    expect(list.json().items).toEqual([]);
  });

  it('shows members the net without manage rights', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/nets/${netId}`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.viewerCanManage).toBe(false);
    expect(body.viewerCanRunSession).toBe(false);
    // Every active member station appears in participation, even with no sessions.
    expect(body.participation).toHaveLength(3);
  });

  it('grants session rights to a member with a net-control-willing station', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/nets/${netId}`,
      cookies: { rc_session: netControlMember.sessionToken },
    });
    expect(response.json().viewerCanRunSession).toBe(true);
  });

  it('lets a coordinator edit the net and rejects member edits', async () => {
    const memberEdit = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/nets/${netId}`,
      cookies: { rc_session: member.sessionToken },
      payload: { name: 'Hijacked' },
    });
    expect(memberEdit.statusCode).toBe(403);

    const coordinatorEdit = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/nets/${netId}`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: { name: 'Sunday Evening Net (updated)' },
    });
    expect(coordinatorEdit.statusCode).toBe(200);
    expect(coordinatorEdit.json().name).toBe('Sunday Evening Net (updated)');
  });

  describe('session lifecycle and check-ins', () => {
    let sessionId: string;

    it('rejects opening a session without net-control rights', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/nets/${netId}/sessions`,
        cookies: { rc_session: member.sessionToken },
        payload: {},
      });
      expect(response.statusCode).toBe(403);
    });

    it('lets a net-control-willing member open a session', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/nets/${netId}/sessions`,
        cookies: { rc_session: netControlMember.sessionToken },
        payload: { netControlStationId },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      sessionId = body.id;
      expect(body.status).toBe('open');
      expect(body.netControlStationName).toBe('Net Control Rig');
    });

    it('rejects opening a second concurrent session', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/nets/${netId}/sessions`,
        cookies: { rc_session: coordinator.sessionToken },
        payload: {},
      });
      expect(response.statusCode).toBe(409);
    });

    it('lets a member check in their own station but not others', async () => {
      const own = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/nets/${netId}/sessions/${sessionId}/checkins`,
        cookies: { rc_session: member.sessionToken },
        payload: { stationId: memberStationId },
      });
      expect(own.statusCode).toBe(201);
      expect(own.json().checkins).toHaveLength(1);

      const other = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/nets/${netId}/sessions/${sessionId}/checkins`,
        cookies: { rc_session: member.sessionToken },
        payload: { stationId: coordinatorStationId },
      });
      expect(other.statusCode).toBe(403);
    });

    it('rejects a duplicate check-in for the same station', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/nets/${netId}/sessions/${sessionId}/checkins`,
        cookies: { rc_session: member.sessionToken },
        payload: { stationId: memberStationId },
      });
      expect(response.statusCode).toBe(409);
    });

    it('lets net control record any Circle station', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/nets/${netId}/sessions/${sessionId}/checkins`,
        cookies: { rc_session: netControlMember.sessionToken },
        payload: { stationId: coordinatorStationId },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().checkins).toHaveLength(2);
    });

    it('can remove a mistaken check-in', async () => {
      const remove = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/v1/nets/${netId}/sessions/${sessionId}/checkins/${coordinatorStationId}`,
        cookies: { rc_session: netControlMember.sessionToken },
      });
      expect(remove.statusCode).toBe(200);
      expect(remove.json().checkins).toHaveLength(1);
    });

    it('closes the session and rejects further check-ins', async () => {
      const close = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/nets/${netId}/sessions/${sessionId}/close`,
        cookies: { rc_session: netControlMember.sessionToken },
        payload: { notes: 'Good turnout.' },
      });
      expect(close.statusCode).toBe(200);
      expect(close.json().status).toBe('closed');
      expect(close.json().endedAt).not.toBeNull();

      const late = await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/nets/${netId}/sessions/${sessionId}/checkins`,
        cookies: { rc_session: netControlMember.sessionToken },
        payload: { stationId: netControlStationId },
      });
      expect(late.statusCode).toBe(409);
    });
  });

  it('computes participation stats across closed sessions', async () => {
    // Second session: only the member's station checks in, then close.
    const open = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/nets/${netId}/sessions`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {},
    });
    const sessionId = open.json().id;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/nets/${netId}/sessions/${sessionId}/checkins`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: { stationId: memberStationId },
    });
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/nets/${netId}/sessions/${sessionId}/close`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {},
    });

    const detail = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/nets/${netId}`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    const body = detail.json();
    expect(body.closedSessionCount).toBe(2);

    const byStation = new Map(
      body.participation.map((row: { stationId: string }) => [row.stationId, row]),
    );
    // Member attended both closed sessions -> streak of 2, perfect recent rate.
    expect(byStation.get(memberStationId)).toMatchObject({
      sessionsAttended: 2,
      currentStreak: 2,
      recentAttendanceRate: 1,
    });
    // Coordinator's check-in was removed in session 1 and absent in session 2.
    expect(byStation.get(coordinatorStationId)).toMatchObject({
      sessionsAttended: 0,
      currentStreak: 0,
      recentAttendanceRate: 0,
    });
  });

  it('archives the net (coordinator only) and hides it from lists', async () => {
    const memberAttempt = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/nets/${netId}/archive`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(memberAttempt.statusCode).toBe(403);

    const archive = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/nets/${netId}/archive`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(archive.statusCode).toBe(200);
    expect(archive.json().status).toBe('archived');

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/nets',
      cookies: { rc_session: member.sessionToken },
    });
    expect(list.json().items).toEqual([]);
  });
});
