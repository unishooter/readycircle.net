import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, deleteTestUser, loginAsNewDevUser, type TestContext, type TestUser } from '../../test/helpers.js';

describe('users API', () => {
  let ctx: TestContext;
  let user: TestUser;

  beforeAll(async () => {
    ctx = await createTestContext();
    user = await loginAsNewDevUser(ctx.app, 'Profile Owner');
  });

  afterAll(async () => {
    await deleteTestUser(ctx.db, user.userId);
    await ctx.close();
  });

  it('defaults new contact fields to unset and invisible', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      cookies: { rc_session: user.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.phone).toBeNull();
    expect(body.address).toBeNull();
    expect(body.emailVisibleToCircle).toBe(false);
    expect(body.phoneVisibleToCircle).toBe(false);
    expect(body.addressVisibleToCircle).toBe(false);
  });

  it('sets phone, address, and visibility toggles', async () => {
    const response = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      cookies: { rc_session: user.sessionToken },
      payload: {
        phone: '555-0100',
        address: '123 Maple St',
        emailVisibleToCircle: true,
        phoneVisibleToCircle: true,
        addressVisibleToCircle: false,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.phone).toBe('555-0100');
    expect(body.address).toBe('123 Maple St');
    expect(body.emailVisibleToCircle).toBe(true);
    expect(body.phoneVisibleToCircle).toBe(true);
    expect(body.addressVisibleToCircle).toBe(false);
  });

  it('clears phone and address with an explicit null', async () => {
    const response = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      cookies: { rc_session: user.sessionToken },
      payload: { phone: null, address: null },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.phone).toBeNull();
    expect(body.address).toBeNull();
    // Visibility toggles set in the previous request are untouched by this partial update.
    expect(body.emailVisibleToCircle).toBe(true);
    expect(body.phoneVisibleToCircle).toBe(true);
  });

  it('rejects requests with no session', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/users/me' });
    expect(response.statusCode).toBe(401);
  });
});
