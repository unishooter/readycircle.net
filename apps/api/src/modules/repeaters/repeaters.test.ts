import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createTestContext,
  deleteTestUser,
  loginAsNewDevUser,
  type TestContext,
  type TestUser,
} from '../../test/helpers.js';
import type { RepeaterBookEntry } from './repeaterbook-client.js';

// The import proxy is exercised against a mocked RepeaterBook client --
// integration tests must not hit the real export API (token + rate limits).
vi.mock('./repeaterbook-client.js', () => ({
  fetchStateRepeaters: vi.fn(),
}));

const { fetchStateRepeaters } = await import('./repeaterbook-client.js');
const fetchStateRepeatersMock = vi.mocked(fetchStateRepeaters);

const RB_ENTRIES: RepeaterBookEntry[] = [
  {
    externalId: 'IL:100',
    callsign: 'WRAA100',
    outputFrequencyMhz: 462.725,
    offsetOrInput: 'input 467.725 MHz',
    tone: '141.3',
    latitude: 39.78,
    longitude: -89.65,
    areaLabel: 'Springfield, IL',
    name: 'Springfield 725 (WRAA100)',
    operational: true,
  },
  {
    externalId: 'IL:200',
    callsign: 'WRBB200',
    outputFrequencyMhz: 462.6,
    offsetOrInput: null,
    tone: null,
    latitude: 39.8,
    longitude: -89.6,
    areaLabel: 'Sherman, IL',
    name: 'Sherman 600 (WRBB200)',
    operational: true,
  },
  {
    externalId: 'IL:300',
    callsign: 'WRCC300',
    outputFrequencyMhz: 462.55,
    offsetOrInput: null,
    tone: '103.5',
    latitude: 39.7,
    longitude: -89.7,
    areaLabel: 'Chatham, IL',
    name: 'Chatham 550 (WRCC300)',
    operational: false,
  },
];

function stationPayload(name: string, extras: Record<string, unknown> = {}) {
  return {
    name,
    stationType: 'home',
    location: { areaLabel: 'Test Area', precision: 'broad_area' },
    capabilities: ['gmrs'],
    experienceLevel: 'new',
    authorization: 'gmrs_license',
    visibility: 'circle',
    ...extras,
  };
}

const manualRepeaterPayload = {
  service: 'gmrs',
  name: 'Water Tower 725',
  callsign: 'WRZZ999',
  outputFrequencyMhz: 462.725,
  offsetOrInput: '+5 MHz',
  tone: '141.3',
  areaLabel: 'Near the water tower',
};

describe('repeaters API', () => {
  let ctx: TestContext;
  let coordinator: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let coordinatorStationId: string;
  let memberStationId: string;
  let circleId: string;
  let memberAddedRepeaterId: string;

  beforeAll(async () => {
    ctx = await createTestContext({ REPEATERBOOK_APP_TOKEN: 'test-rb-token' });
    coordinator = await loginAsNewDevUser(ctx.app, 'Repeater Coordinator');
    member = await loginAsNewDevUser(ctx.app, 'Repeater Member');
    outsider = await loginAsNewDevUser(ctx.app, 'Repeater Outsider');

    const coordStation = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: coordinator.sessionToken },
      payload: stationPayload('Coordinator Base'),
    });
    coordinatorStationId = coordStation.json().id;

    const circleResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        circleType: 'neighborhood',
        name: 'Repeater Test Circle',
        area: { areaLabel: 'Repeaterville' },
        creatorStationId: coordinatorStationId,
      },
    });
    circleId = circleResponse.json().id;

    const memberStation = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: member.sessionToken },
      payload: stationPayload('Member Handheld'),
    });
    memberStationId = memberStation.json().id;
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: member.sessionToken },
      payload: { stationId: memberStationId },
    });
  });

  afterAll(async () => {
    for (const user of [coordinator, member, outsider]) {
      await deleteTestUser(ctx.db, user.userId);
    }
    await ctx.close();
  });

  it('lets any member add a repeater manually', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/repeaters`,
      cookies: { rc_session: member.sessionToken },
      payload: manualRepeaterPayload,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    memberAddedRepeaterId = body.id;
    expect(body.service).toBe('gmrs');
    expect(body.name).toBe('Water Tower 725');
    expect(body.source).toBe('manual');
    expect(body.status).toBe('active');
    expect(body.viewerCanManage).toBe(true);
  });

  it('hides the directory from non-members', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/repeaters`,
      cookies: { rc_session: outsider.sessionToken },
    });
    expect(response.statusCode).toBe(403);
  });

  it('lists repeaters for members with manage flags per viewer', async () => {
    const asMember = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/repeaters`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(asMember.statusCode).toBe(200);
    const memberItems = asMember.json().items;
    expect(memberItems).toHaveLength(1);
    expect(memberItems[0].viewerCanManage).toBe(true); // they added it

    const asCoordinator = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/repeaters`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(asCoordinator.json().items[0].viewerCanManage).toBe(true); // coordinator curates anything
  });

  it('lets a coordinator curate a member-added repeater but blocks other members', async () => {
    // A second member who did not add the entry cannot edit it.
    const secondMember = await loginAsNewDevUser(ctx.app, 'Second Repeater Member');
    try {
      const secondStation = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/stations',
        cookies: { rc_session: secondMember.sessionToken },
        payload: stationPayload('Second Handheld'),
      });
      await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/circles/${circleId}/members`,
        cookies: { rc_session: secondMember.sessionToken },
        payload: { stationId: secondStation.json().id },
      });

      const forbidden = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/repeaters/${memberAddedRepeaterId}`,
        cookies: { rc_session: secondMember.sessionToken },
        payload: { status: 'offline' },
      });
      expect(forbidden.statusCode).toBe(403);

      const curated = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/repeaters/${memberAddedRepeaterId}`,
        cookies: { rc_session: coordinator.sessionToken },
        payload: { status: 'unverified', notes: 'Heard intermittently.' },
      });
      expect(curated.statusCode).toBe(200);
      expect(curated.json().status).toBe('unverified');
      expect(curated.json().notes).toBe('Heard intermittently.');
    } finally {
      await deleteTestUser(ctx.db, secondMember.userId);
    }
  });

  it('searches RepeaterBook through the proxy, filtering non-operational entries', async () => {
    fetchStateRepeatersMock.mockResolvedValue(RB_ENTRIES);

    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/repeaters/import-search?service=gmrs&state=Illinois`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.configured).toBe(true);
    expect(body.state).toBe('Illinois');
    // The non-operational Chatham entry is filtered out.
    expect(body.candidates.map((c: { externalId: string }) => c.externalId).sort()).toEqual([
      'IL:100',
      'IL:200',
    ]);
    expect(body.candidates.every((c: { alreadyImported: boolean }) => !c.alreadyImported)).toBe(true);
  });

  it('imports selected candidates and dedupes on re-import', async () => {
    fetchStateRepeatersMock.mockResolvedValue(RB_ENTRIES);

    const first = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/repeaters/import`,
      cookies: { rc_session: member.sessionToken },
      payload: { externalIds: ['IL:100', 'IL:200'], service: 'gmrs', state: 'Illinois' },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().items).toHaveLength(2);
    expect(first.json().items[0].source).toBe('repeaterbook');

    // Re-importing the same externalIds silently skips duplicates.
    const again = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/repeaters/import`,
      cookies: { rc_session: member.sessionToken },
      payload: { externalIds: ['IL:100', 'IL:200'], service: 'gmrs', state: 'Illinois' },
    });
    expect(again.statusCode).toBe(201);
    expect(again.json().items).toHaveLength(0);

    // The search now marks them as already imported.
    const search = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/repeaters/import-search?service=gmrs&state=Illinois`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(search.json().candidates.every((c: { alreadyImported: boolean }) => c.alreadyImported)).toBe(true);
  });

  it('reports unconfigured when no RepeaterBook token is set', async () => {
    const bare = await createTestContext();
    const user = await loginAsNewDevUser(bare.app, 'Unconfigured User');
    try {
      const stationResponse = await bare.app.inject({
        method: 'POST',
        url: '/api/v1/stations',
        cookies: { rc_session: user.sessionToken },
        payload: stationPayload('Unconfigured Base'),
      });
      const circleResponse = await bare.app.inject({
        method: 'POST',
        url: '/api/v1/circles',
        cookies: { rc_session: user.sessionToken },
        payload: {
          circleType: 'neighborhood',
          name: 'Unconfigured Circle',
          area: { areaLabel: 'Nowhere' },
          creatorStationId: stationResponse.json().id,
        },
      });

      const search = await bare.app.inject({
        method: 'GET',
        url: `/api/v1/circles/${circleResponse.json().id}/repeaters/import-search?service=gmrs&state=Illinois`,
        cookies: { rc_session: user.sessionToken },
      });
      expect(search.statusCode).toBe(200);
      expect(search.json()).toEqual({ configured: false, state: null, candidates: [] });
    } finally {
      await deleteTestUser(bare.db, user.userId);
      await bare.close();
    }
  });

  it('lets a station owner declare RX/TX links to repeaters in its Circles', async () => {
    const options = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stations/${memberStationId}/available-repeaters`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(options.statusCode).toBe(200);
    expect(options.json().items.length).toBeGreaterThanOrEqual(3); // manual + 2 imported

    const set = await ctx.app.inject({
      method: 'PUT',
      url: `/api/v1/stations/${memberStationId}/repeaters`,
      cookies: { rc_session: member.sessionToken },
      payload: {
        links: [{ repeaterId: memberAddedRepeaterId, access: 'rx_tx' }],
      },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().items).toEqual([
      expect.objectContaining({ repeaterId: memberAddedRepeaterId, access: 'rx_tx' }),
    ]);

    const list = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/stations/${memberStationId}/repeaters`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(list.json().items).toHaveLength(1);
  });

  it('rejects linking a station to a repeater outside its Circles', async () => {
    // The outsider creates their own circle + repeater; the member's
    // station has no roster relationship with it.
    const outsiderStation = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: outsider.sessionToken },
      payload: stationPayload('Outsider Base'),
    });
    const outsiderCircle = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: outsider.sessionToken },
      payload: {
        circleType: 'neighborhood',
        name: 'Other Circle',
        area: { areaLabel: 'Elsewhere' },
        creatorStationId: outsiderStation.json().id,
      },
    });
    const foreignRepeater = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${outsiderCircle.json().id}/repeaters`,
      cookies: { rc_session: outsider.sessionToken },
      payload: manualRepeaterPayload,
    });
    expect(foreignRepeater.statusCode).toBe(201);

    const response = await ctx.app.inject({
      method: 'PUT',
      url: `/api/v1/stations/${memberStationId}/repeaters`,
      cookies: { rc_session: member.sessionToken },
      payload: { links: [{ repeaterId: foreignRepeater.json().id, access: 'rx' }] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('lets only the member who added a repeater (or a coordinator) delete it', async () => {
    const outsiderDelete = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/repeaters/${memberAddedRepeaterId}`,
      cookies: { rc_session: outsider.sessionToken },
    });
    expect(outsiderDelete.statusCode).toBe(403);

    const memberDelete = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/repeaters/${memberAddedRepeaterId}`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(memberDelete.statusCode).toBe(204);
  });

  it('requires authentication', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/circles/${circleId}/repeaters`,
    });
    expect(response.statusCode).toBe(401);
  });
});
