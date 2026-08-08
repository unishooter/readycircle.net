import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { users } from '@readycircle/database';
import { createTestContext, deleteTestUser, loginAsNewDevUser, type TestContext, type TestUser } from '../../test/helpers.js';

describe('admin API', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let nonAdmin: TestUser;
  // The shared dev database already has grandfathered admins from earlier
  // migrations/usage. To make the "last admin" safeguard deterministic, we
  // temporarily demote every *other* admin for the duration of this suite
  // and restore them afterwards, rather than assuming a clean slate.
  let otherAdminIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestContext();
    admin = await loginAsNewDevUser(ctx.app, 'Grandfathered Admin');
    nonAdmin = await loginAsNewDevUser(ctx.app, 'Regular User');
    // New dev users are not grandfathered admins -- promote one directly at
    // the database layer to seed an admin for this test's starting state.
    await ctx.db.update(users).set({ isAdmin: true }).where(eq(users.id, admin.userId));

    const existingAdmins = await ctx.db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true));
    otherAdminIds = existingAdmins.map((row) => row.id).filter((id) => id !== admin.userId);
    if (otherAdminIds.length > 0) {
      await ctx.db.update(users).set({ isAdmin: false }).where(inArray(users.id, otherAdminIds));
    }
  });

  afterAll(async () => {
    if (otherAdminIds.length > 0) {
      await ctx.db.update(users).set({ isAdmin: true }).where(inArray(users.id, otherAdminIds));
    }
    await deleteTestUser(ctx.db, admin.userId);
    await deleteTestUser(ctx.db, nonAdmin.userId);
    await ctx.close();
  });

  it('rejects non-admins from listing users', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      cookies: { rc_session: nonAdmin.sessionToken },
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets an admin list users', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      cookies: { rc_session: admin.sessionToken },
    });
    expect(response.statusCode).toBe(200);
    const ids = response.json().items.map((u: { id: string }) => u.id);
    expect(ids).toContain(admin.userId);
    expect(ids).toContain(nonAdmin.userId);
  });

  it('lets an admin promote another user to admin', async () => {
    const response = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${nonAdmin.userId}`,
      cookies: { rc_session: admin.sessionToken },
      payload: { isAdmin: true },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().isAdmin).toBe(true);
  });

  it('blocks demoting the last remaining admin', async () => {
    // Demote the freshly-promoted nonAdmin back down first, leaving `admin` as the sole admin.
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${nonAdmin.userId}`,
      cookies: { rc_session: admin.sessionToken },
      payload: { isAdmin: false },
    });

    const response = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${admin.userId}`,
      cookies: { rc_session: admin.sessionToken },
      payload: { isAdmin: false },
    });
    expect(response.statusCode).toBe(409);
  });

  it('rejects non-admins from reading or updating settings', async () => {
    const getResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings',
      cookies: { rc_session: nonAdmin.sessionToken },
    });
    expect(getResponse.statusCode).toBe(403);

    const patchResponse = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      cookies: { rc_session: nonAdmin.sessionToken },
      payload: { inviteOnlyAccess: true },
    });
    expect(patchResponse.statusCode).toBe(403);
  });

  it('round-trips the invite-only-access override: set, read back, then clear', async () => {
    const setResponse = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      cookies: { rc_session: admin.sessionToken },
      payload: { inviteOnlyAccess: true },
    });
    expect(setResponse.statusCode).toBe(200);
    expect(setResponse.json()).toMatchObject({ inviteOnlyAccess: { override: true, effective: true } });

    const getResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings',
      cookies: { rc_session: admin.sessionToken },
    });
    expect(getResponse.json()).toMatchObject({ inviteOnlyAccess: { override: true, effective: true } });

    const clearResponse = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      cookies: { rc_session: admin.sessionToken },
      payload: { inviteOnlyAccess: null },
    });
    expect(clearResponse.json()).toMatchObject({
      inviteOnlyAccess: { override: null, effective: clearResponse.json().inviteOnlyAccess.envDefault },
    });
  });

  it('round-trips the APRS-IS config blob: set, read back, then clear', async () => {
    const aprs = {
      enabled: true,
      host: 'custom.aprs2.net',
      port: 14580,
      callsign: 'KI5ABC',
      passcode: '-1',
    };
    const setResponse = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      cookies: { rc_session: admin.sessionToken },
      payload: { aprs },
    });
    expect(setResponse.statusCode).toBe(200);
    expect(setResponse.json()).toMatchObject({ aprs: { override: aprs, effective: aprs } });

    const getResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings',
      cookies: { rc_session: admin.sessionToken },
    });
    expect(getResponse.json()).toMatchObject({ aprs: { override: aprs, effective: aprs } });

    const sessionResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/session',
      cookies: { rc_session: admin.sessionToken },
    });
    expect(sessionResponse.json()).toMatchObject({ aprsEnabled: true });

    const clearResponse = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      cookies: { rc_session: admin.sessionToken },
      payload: { aprs: null },
    });
    expect(clearResponse.json()).toMatchObject({
      aprs: { override: null, effective: clearResponse.json().aprs.envDefault },
    });
  });

  it('rejects an invalid APRS login callsign', async () => {
    const response = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      cookies: { rc_session: admin.sessionToken },
      payload: {
        aprs: {
          enabled: true,
          host: 'rotate.aprs2.net',
          port: 14580,
          callsign: '!!bad!!',
          passcode: '-1',
        },
      },
    });
    expect(response.statusCode).toBe(400);
  });
});
