import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO, type PlanAdvisory } from '@readycircle/contracts';
import {
  generatePlanDocument,
  generatePlanVersion,
  type AdvisoryProvider,
  type DocumentStore,
  type EngineLogger,
  type PlanContext,
  type StoredDocument,
} from '@readycircle/plan-engine';
import {
  createTestContext,
  deleteTestUser,
  loginAsNewDevUser,
  type TestContext,
  type TestUser,
} from '../../test/helpers.js';
import type { DocumentGenerationJob, JobDispatcher, PlanGenerationJob } from './dispatcher.js';

const silentLogger: EngineLogger = { info: () => {}, warn: () => {}, error: () => {} };

/** Records dispatched jobs instead of touching SQS or running generation. */
class RecordingDispatcher implements JobDispatcher {
  planJobs: PlanGenerationJob[] = [];
  documentJobs: DocumentGenerationJob[] = [];

  async dispatchPlanGeneration(job: PlanGenerationJob): Promise<void> {
    this.planJobs.push(job);
  }

  async dispatchDocumentGeneration(job: DocumentGenerationJob): Promise<void> {
    this.documentJobs.push(job);
  }
}

class InMemoryDocumentStore implements DocumentStore {
  private readonly objects = new Map<string, StoredDocument>();

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async get(key: string): Promise<StoredDocument | null> {
    return this.objects.get(key) ?? null;
  }
}

/** Deterministic advisory referencing the first roster station, mimicking a well-behaved model. */
class StubAdvisoryProvider implements AdvisoryProvider {
  async generateAdvisory(context: PlanContext): Promise<PlanAdvisory> {
    const first = context.members[0];
    if (!first) throw new Error('stub advisory requires at least one member');
    return {
      channelPlan: {
        narrative: 'Use FRS channel 3 as the shared channel.',
        entries: [
          {
            purpose: 'primary',
            service: 'FRS',
            channelOrFrequency: 'FRS channel 3 (462.6125 MHz)',
            whoCanUse: 'All stations',
            notes: null,
          },
        ],
      },
      roleAssignments: {
        narrative: 'One assignment.',
        assignments: [
          { role: 'net_control', stationId: first.stationId, stationName: first.stationName, rationale: 'Willing.' },
        ],
      },
      checkInSchedule: {
        narrative: 'Weekly practice net.',
        cadence: 'Weekly',
        dayAndTime: 'Sundays at 19:00 local time',
        durationMinutes: 20,
        procedure: ['Net control opens the net.'],
      },
      gearRecommendations: {
        narrative: 'Baseline gear will do for now.',
        items: [
          {
            stationName: first.stationName,
            gap: 'Marginal link to the rest of the Circle.',
            recommendation: '50 W GMRS mobile with a base antenna at ~20 ft',
            priority: 'recommended',
          },
        ],
      },
      recommendations: {
        narrative: 'A couple of gaps.',
        items: [{ title: 'Add a backup channel', detail: 'Consider a GMRS backup.', severity: 'advisory' }],
      },
    };
  }
}

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

describe('plans API', () => {
  let ctx: TestContext;
  let dispatcher: RecordingDispatcher;
  let documentStore: InMemoryDocumentStore;
  let coordinator: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let circleId: string;
  let planId: string;
  let firstVersionId: string;

  beforeAll(async () => {
    dispatcher = new RecordingDispatcher();
    documentStore = new InMemoryDocumentStore();
    ctx = await createTestContext({}, { planJobDispatcher: dispatcher, planDocumentStore: documentStore });

    coordinator = await loginAsNewDevUser(ctx.app, 'Plan Coordinator');
    member = await loginAsNewDevUser(ctx.app, 'Plan Member');
    outsider = await loginAsNewDevUser(ctx.app, 'Plan Outsider');

    const coordStation = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: coordinator.sessionToken },
      payload: stationPayload("Coordinator's Station"),
    });
    const coordStationId = coordStation.json().id;

    const circleResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/circles',
      cookies: { rc_session: coordinator.sessionToken },
      payload: {
        circleType: 'neighborhood',
        name: 'Plans Test Circle',
        area: { areaLabel: 'Plans Test Area' },
        creatorStationId: coordStationId,
      },
    });
    circleId = circleResponse.json().id;

    const memberStation = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/stations',
      cookies: { rc_session: member.sessionToken },
      payload: stationPayload("Member's Station"),
    });
    await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/members`,
      cookies: { rc_session: member.sessionToken },
      payload: { stationId: memberStation.json().id },
    });
  });

  afterAll(async () => {
    await deleteTestUser(ctx.db, coordinator.userId);
    await deleteTestUser(ctx.db, member.userId);
    await deleteTestUser(ctx.db, outsider.userId);
    await ctx.close();
  });

  it('rejects plan generation by a non-coordinator member', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/plans`,
      cookies: { rc_session: member.sessionToken },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    expect(dispatcher.planJobs).toHaveLength(0);
  });

  it('creates a plan with a generating first version and dispatches the job', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/circles/${circleId}/plans`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    planId = body.id;
    expect(body.title).toBe('Plans Test Circle communications plan');
    expect(body.viewerCanManage).toBe(true);
    expect(body.latestVersion.status).toBe('generating');
    expect(body.latestVersion.versionNumber).toBe(1);
    // No scenario supplied -> the 72-hour default preset is stored.
    expect(body.latestVersion.scenario).toEqual(DEFAULT_SCENARIO);
    firstVersionId = body.latestVersion.id;

    expect(dispatcher.planJobs).toEqual([
      { planVersionId: firstVersionId, requestedByUserId: coordinator.userId },
    ]);
  });

  it('lists the plan for members but hides it from outsiders', async () => {
    const memberList = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/plans',
      cookies: { rc_session: member.sessionToken },
    });
    expect(memberList.statusCode).toBe(200);
    expect(memberList.json().items.map((p: { id: string }) => p.id)).toContain(planId);
    const memberPlan = memberList.json().items.find((p: { id: string }) => p.id === planId);
    expect(memberPlan.viewerCanManage).toBe(false);

    const outsiderList = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/plans',
      cookies: { rc_session: outsider.sessionToken },
    });
    expect(outsiderList.json().items).toEqual([]);

    const outsiderDetail = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/plans/${planId}`,
      cookies: { rc_session: outsider.sessionToken },
    });
    expect(outsiderDetail.statusCode).toBe(403);
  });

  it('rejects publishing a version that is still generating', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/plans/${planId}/versions/${firstVersionId}/publish`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(response.statusCode).toBe(409);
  });

  it('rejects regenerating while a version is still generating', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/plans/${planId}/regenerate`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(response.statusCode).toBe(409);
  });

  it('fills the version with sections when the engine runs (as the worker would)', async () => {
    const result = await generatePlanVersion({
      db: ctx.db,
      planVersionId: firstVersionId,
      advisoryProvider: new StubAdvisoryProvider(),
      logger: silentLogger,
    });
    expect(result.status).toBe('draft');

    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/plans/${planId}/versions/${firstVersionId}`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('draft');
    expect(body.sections.map((s: { sectionKey: string }) => s.sectionKey)).toEqual([
      'overview',
      'roster',
      'connectivity',
      'channel_plan',
      'role_assignments',
      'check_in_schedule',
      'gear_recommendations',
      'recommendations',
    ]);
    const roster = body.sections.find((s: { sectionKey: string }) => s.sectionKey === 'roster');
    expect(roster.content.entries).toHaveLength(2);

    // Scenario plumbing: the version echoes the stored scenario and the
    // deterministic overview carries its human-readable description.
    expect(body.scenario).toEqual(DEFAULT_SCENARIO);
    const overview = body.sections.find((s: { sectionKey: string }) => s.sectionKey === 'overview');
    expect(overview.content.scenarioDescription).toContain('power outage');

    // Connectivity facts come from the deterministic RF engine. These
    // fixture stations have no coordinates, so both are flagged unknown.
    const connectivity = body.sections.find((s: { sectionKey: string }) => s.sectionKey === 'connectivity');
    expect(connectivity.content.stations).toHaveLength(2);
    expect(typeof connectivity.content.baselineRelay.pass).toBe('boolean');
    for (const station of connectivity.content.stations) {
      expect(station.hasLocation).toBe(false);
      expect(station.role).toBe('unknown');
    }

    const gear = body.sections.find((s: { sectionKey: string }) => s.sectionKey === 'gear_recommendations');
    expect(gear.content.items).toHaveLength(1);
    expect(gear.content.items[0].recommendation).toContain('GMRS');
  });

  it('marks the version failed (not thrown) when the advisory provider errors', async () => {
    const customScenario = {
      circumstances: ['power_outage'],
      duration: 'weeks_plus',
      extent: 'regional',
      notes: 'Ice storm follow-up',
    };
    const regen = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/plans/${planId}/regenerate`,
      cookies: { rc_session: coordinator.sessionToken },
      payload: { scenario: customScenario },
    });
    expect(regen.statusCode).toBe(201);
    // Regenerate accepts an explicit scenario for the new version.
    expect(regen.json().latestVersion.scenario).toEqual(customScenario);
    const failingVersionId = regen.json().latestVersion.id;

    const failingProvider: AdvisoryProvider = {
      generateAdvisory: () => Promise.reject(new Error('model unavailable')),
    };
    const result = await generatePlanVersion({
      db: ctx.db,
      planVersionId: failingVersionId,
      advisoryProvider: failingProvider,
      logger: silentLogger,
    });
    expect(result.status).toBe('failed');

    const detail = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/plans/${planId}/versions/${failingVersionId}`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(detail.json().status).toBe('failed');
    expect(detail.json().errorMessage).toContain('model unavailable');
  });

  it('publishes a draft version (coordinator only) and dispatches document generation', async () => {
    const memberAttempt = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/plans/${planId}/versions/${firstVersionId}/publish`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(memberAttempt.statusCode).toBe(403);

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/plans/${planId}/versions/${firstVersionId}/publish`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('published');
    expect(response.json().publishedAt).toBeTruthy();
    expect(dispatcher.documentJobs).toEqual([{ planVersionId: firstVersionId, format: 'pdf' }]);

    const again = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/plans/${planId}/versions/${firstVersionId}/publish`,
      cookies: { rc_session: coordinator.sessionToken },
    });
    expect(again.statusCode).toBe(409);
  });

  it('renders, stores, and serves the PDF document', async () => {
    const result = await generatePlanDocument({
      db: ctx.db,
      planVersionId: firstVersionId,
      format: 'pdf',
      store: documentStore,
      logger: silentLogger,
    });
    expect(result.status).toBe('ready');

    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/plans/${planId}/versions/${firstVersionId}/document`,
      cookies: { rc_session: member.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');

    const outsiderResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/plans/${planId}/versions/${firstVersionId}/document`,
      cookies: { rc_session: outsider.sessionToken },
    });
    expect(outsiderResponse.statusCode).toBe(403);
  });

  it('requires authentication for all plan routes', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/plans' });
    expect(response.statusCode).toBe(401);
  });
});
