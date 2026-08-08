import type { AppConfig } from '@readycircle/config';
import type { Database } from '@readycircle/database';
import { canManageAdmins, resolveBooleanSetting, wouldLeaveAppWithoutAdmin } from '@readycircle/domain';
import type {
  AdminUserSummary,
  AprsIsConfig,
  PlatformSettingsResponse,
  UpdatePlatformSettingsInput,
} from '@readycircle/contracts';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { AuditService } from '../audit/service.js';
import {
  envAprsIsConfig,
  getAprsIsConfigOverride,
  getInviteOnlyAccessOverride,
  setAprsIsConfigOverride,
  setInviteOnlyAccessOverride,
} from './effective-settings.js';
import { countOtherAdmins, getAdminUserRow, listAllUsers, setUserIsAdmin, type AdminUserRow } from './repository.js';

function mapUser(row: AdminUserRow): AdminUserSummary {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    isAdmin: row.isAdmin,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapBooleanSetting(envDefault: boolean, override: boolean | null) {
  return { envDefault, override, effective: resolveBooleanSetting(envDefault, override) };
}

function mapAprsSetting(envDefault: AprsIsConfig, override: AprsIsConfig | null) {
  return { envDefault, override, effective: override ?? envDefault };
}

export class AdminService {
  constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  /** Every admin route must call this immediately after `requireAuth`. */
  async requireAdmin(userId: string): Promise<void> {
    const viewer = await getAdminUserRow(this.db, userId);
    if (!viewer || !canManageAdmins(viewer.isAdmin)) {
      throw new ForbiddenError('Only admins may access this resource.');
    }
  }

  async listUsers(): Promise<AdminUserSummary[]> {
    const rows = await listAllUsers(this.db);
    return rows.map(mapUser);
  }

  async setUserAdmin(
    targetUserId: string,
    isAdmin: boolean,
    actingUserId: string,
    requestId: string,
  ): Promise<AdminUserSummary> {
    const target = await getAdminUserRow(this.db, targetUserId);
    if (!target) throw new NotFoundError('User not found.');

    if (target.isAdmin !== isAdmin) {
      if (!isAdmin) {
        const others = await countOtherAdmins(this.db, targetUserId);
        if (wouldLeaveAppWithoutAdmin(others, target.isAdmin)) {
          throw new ConflictError('At least one admin must always exist -- promote another user first.');
        }
      }
      await setUserIsAdmin(this.db, targetUserId, isAdmin);
      await this.audit.record({
        actorUserId: actingUserId,
        action: isAdmin ? 'admin.granted' : 'admin.revoked',
        targetType: 'user',
        targetId: targetUserId,
        requestId,
      });
    }

    const updated = await getAdminUserRow(this.db, targetUserId);
    if (!updated) throw new NotFoundError('User not found after update.');
    return mapUser(updated);
  }

  async getSettings(): Promise<PlatformSettingsResponse> {
    const [inviteOverride, aprsOverride] = await Promise.all([
      getInviteOnlyAccessOverride(this.db),
      getAprsIsConfigOverride(this.db, this.config),
    ]);
    const aprsEnvDefault = envAprsIsConfig(this.config);
    return {
      inviteOnlyAccess: mapBooleanSetting(this.config.inviteOnlyAccess, inviteOverride),
      aprs: mapAprsSetting(aprsEnvDefault, aprsOverride),
    };
  }

  async updateSettings(
    input: UpdatePlatformSettingsInput,
    actingUserId: string,
    requestId: string,
  ): Promise<PlatformSettingsResponse> {
    if (input.inviteOnlyAccess !== undefined) {
      await setInviteOnlyAccessOverride(this.db, input.inviteOnlyAccess, actingUserId);
    }
    if (input.aprs !== undefined) {
      await setAprsIsConfigOverride(this.db, input.aprs, actingUserId);
    }
    await this.audit.record({
      actorUserId: actingUserId,
      action: 'settings.updated',
      targetType: 'platform_settings',
      targetId: null,
      requestId,
      metadata: {
        ...(input.inviteOnlyAccess !== undefined ? { inviteOnlyAccess: input.inviteOnlyAccess } : {}),
        ...(input.aprs !== undefined
          ? {
              aprs: input.aprs
                ? {
                    enabled: input.aprs.enabled,
                    host: input.aprs.host,
                    port: input.aprs.port,
                    callsign: input.aprs.callsign,
                    // Passcode is intentionally omitted from audit metadata.
                  }
                : null,
            }
          : {}),
      },
    });
    return this.getSettings();
  }
}
