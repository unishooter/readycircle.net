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
    expect(body.contactEmail).toBeNull();
    expect(body.phone).toBeNull();
    expect(body.address).toBeNull();
    expect(body.city).toBeNull();
    expect(body.state).toBeNull();
    expect(body.zip).toBeNull();
    expect(body.emailVisibleToCircle).toBe(false);
    expect(body.phoneVisibleToCircle).toBe(false);
    expect(body.addressVisibleToCircle).toBe(false);
  });

  it('sets contactEmail, phone, address parts, and visibility toggles', async () => {
    const response = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      cookies: { rc_session: user.sessionToken },
      payload: {
        contactEmail: 'shared@example.com',
        phone: '555-0100',
        address: '123 Maple St',
        city: 'Springfield',
        state: 'IL',
        zip: '62704',
        emailVisibleToCircle: true,
        phoneVisibleToCircle: true,
        addressVisibleToCircle: false,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.contactEmail).toBe('shared@example.com');
    expect(body.phone).toBe('555-0100');
    expect(body.address).toBe('123 Maple St');
    expect(body.city).toBe('Springfield');
    expect(body.state).toBe('IL');
    expect(body.zip).toBe('62704');
    expect(body.emailVisibleToCircle).toBe(true);
    expect(body.phoneVisibleToCircle).toBe(true);
    expect(body.addressVisibleToCircle).toBe(false);
  });

  it('clears contactEmail, phone, and address parts with an explicit null', async () => {
    const response = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      cookies: { rc_session: user.sessionToken },
      payload: { contactEmail: null, phone: null, address: null, city: null, state: null, zip: null },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.contactEmail).toBeNull();
    expect(body.phone).toBeNull();
    expect(body.address).toBeNull();
    expect(body.city).toBeNull();
    expect(body.state).toBeNull();
    expect(body.zip).toBeNull();
    // Visibility toggles set in the previous request are untouched by this partial update.
    expect(body.emailVisibleToCircle).toBe(true);
    expect(body.phoneVisibleToCircle).toBe(true);
  });

  it('rejects a malformed contactEmail or zip', async () => {
    const badEmail = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      cookies: { rc_session: user.sessionToken },
      payload: { contactEmail: 'not-an-email' },
    });
    expect(badEmail.statusCode).toBe(400);

    const badZip = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      cookies: { rc_session: user.sessionToken },
      payload: { zip: 'abcde' },
    });
    expect(badZip.statusCode).toBe(400);
  });

  it('rejects requests with no session', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/v1/users/me' });
    expect(response.statusCode).toBe(401);
  });
});
