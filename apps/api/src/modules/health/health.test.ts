import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/helpers.js';

describe('health endpoints', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('GET /health/live returns ok without touching the database', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready confirms database connectivity', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('includes a request id header on every response', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health/live' });
    expect(response.headers['x-request-id']).toBeTruthy();
  });
});
