import { z } from 'zod';

/**
 * Enum definitions shared by the API and the web app. Keeping labels here
 * (rather than hardcoding user-facing strings in the frontend) keeps the
 * product vocabulary from the spec consistent across every surface.
 */

export const stationTypeSchema = z.enum([
  'home',
  'handheld',
  'vehicle',
  'portable',
  'organization',
  'meshtastic',
  'meshcore',
  'receive_only',
  'other',
]);
export type StationType = z.infer<typeof stationTypeSchema>;
export const STATION_TYPE_LABELS: Record<StationType, string> = {
  home: 'Home',
  handheld: 'Handheld radio',
  vehicle: 'Vehicle',
  portable: 'Portable kit',
  organization: 'Organization facility',
  meshtastic: 'Meshtastic node',
  meshcore: 'MeshCore node',
  receive_only: 'Receive-only monitoring position',
  other: 'Other',
};

/**
 * Radio + comm-tech capabilities a station declares. `amateur` keeps its
 * stored value but is labeled "dual band" -- an unlocked UV-5R-class
 * GMRS + dual-band HT is the assumed baseline station, and dual-band
 * *listening* is common even without an amateur license. The satellite and
 * mesh values feed the scenario-aware connectivity analysis (paths that
 * survive no-cell/no-internet circumstances).
 */
export const radioCapabilitySchema = z.enum([
  'frs',
  'gmrs',
  'amateur',
  'satellite_internet',
  'satellite_phone',
  'meshtastic',
  'meshcore',
  'receive_only',
  'other',
]);
export type RadioCapability = z.infer<typeof radioCapabilitySchema>;
export const RADIO_CAPABILITY_LABELS: Record<RadioCapability, string> = {
  frs: 'FRS (Family Radio Service)',
  gmrs: 'GMRS (General Mobile Radio Service)',
  amateur: 'Amateur dual band (2m/70cm)',
  satellite_internet: 'Satellite internet (Starlink or comparable)',
  satellite_phone: 'Satellite phone / messenger',
  meshtastic: 'Meshtastic mesh node',
  meshcore: 'MeshCore mesh node',
  receive_only: 'Receive-only',
  other: 'Other',
};

export const antennaTypeSchema = z.enum([
  'rubber_duck',
  'mobile_whip',
  'base_vertical',
  'directional',
  'wire',
  'other',
]);
export type AntennaType = z.infer<typeof antennaTypeSchema>;
export const ANTENNA_TYPE_LABELS: Record<AntennaType, string> = {
  rubber_duck: 'Stock handheld antenna (rubber duck)',
  mobile_whip: 'Mobile whip (vehicle mount)',
  base_vertical: 'Base station vertical',
  directional: 'Directional (Yagi or beam)',
  wire: 'Wire antenna',
  other: 'Other',
};

export const backupPowerSchema = z.enum(['battery', 'generator', 'solar']);
export type BackupPower = z.infer<typeof backupPowerSchema>;
export const BACKUP_POWER_LABELS: Record<BackupPower, string> = {
  battery: 'Battery bank',
  generator: 'Generator',
  solar: 'Solar',
};

export const experienceLevelSchema = z.enum(['new', 'basic', 'comfortable', 'experienced']);
export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;
export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  new: 'New to radio',
  basic: 'Basic familiarity',
  comfortable: 'Comfortable operating',
  experienced: 'Experienced operator',
};

export const authorizationSchema = z.enum([
  'frs_user',
  'gmrs_license',
  'amateur_technician',
  'amateur_general',
  'amateur_extra',
  'other',
]);
export type StationAuthorization = z.infer<typeof authorizationSchema>;
export const AUTHORIZATION_LABELS: Record<StationAuthorization, string> = {
  frs_user: 'FRS user (no license required)',
  gmrs_license: 'GMRS license',
  amateur_technician: 'Amateur radio - Technician class',
  amateur_general: 'Amateur radio - General class',
  amateur_extra: 'Amateur radio - Extra class',
  other: 'Other authorization',
};

export const stationGoalSchema = z.enum([
  'nearby_family_communication',
  'neighborhood_welfare_checks',
  'receive_emergency_information',
  'request_assistance',
  'offer_assistance',
  'cellular_outage_communication',
  'reach_specific_area',
  'practice_radio_skills',
  'social_communication',
  'serve_as_relay',
  'support_organization',
  'evaluate_equipment_improvements',
]);
export type StationGoal = z.infer<typeof stationGoalSchema>;
export const STATION_GOAL_LABELS: Record<StationGoal, string> = {
  nearby_family_communication: 'Communicate with nearby family',
  neighborhood_welfare_checks: 'Neighborhood welfare checks',
  receive_emergency_information: 'Receive emergency information',
  request_assistance: 'Request assistance',
  offer_assistance: 'Offer assistance',
  cellular_outage_communication: 'Communicate during a cellular outage',
  reach_specific_area: 'Reach a specific area',
  practice_radio_skills: 'Practice radio skills',
  social_communication: 'Social communication',
  serve_as_relay: 'Serve as a relay station',
  support_organization: 'Support an organization',
  evaluate_equipment_improvements: 'Evaluate equipment improvements',
};

export const stationVisibilitySchema = z.enum([
  'private',
  'circle',
  'coordinators',
  'discoverable_aggregate',
]);
export type StationVisibility = z.infer<typeof stationVisibilitySchema>;
export const STATION_VISIBILITY_LABELS: Record<StationVisibility, string> = {
  private: 'Private - only visible to me',
  circle: 'Visible to members of my Radio Circles',
  coordinators: 'Visible to Circle coordinators only',
  discoverable_aggregate: 'Included in aggregate nearby-station counts',
};

export const locationPrecisionSchema = z.enum([
  'hidden',
  'broad_area',
  'one_km_grid',
  'precise_private',
]);
export type LocationPrecision = z.infer<typeof locationPrecisionSchema>;
export const LOCATION_PRECISION_LABELS: Record<LocationPrecision, string> = {
  hidden: 'Hidden - do not display my location',
  broad_area: 'Broad area (e.g. town or region name)',
  one_km_grid: 'Approximate 1km grid square',
  precise_private: 'Precise, visible only to me',
};

export const circleTypeSchema = z.enum(['neighborhood', 'family', 'organization', 'custom']);
export type CircleType = z.infer<typeof circleTypeSchema>;
export const CIRCLE_TYPE_LABELS: Record<CircleType, string> = {
  neighborhood: 'Neighborhood Radio Circle',
  family: 'Family Radio Circle',
  organization: 'Organization Radio Circle',
  custom: 'Custom Radio Circle',
};

export const circleRoleSchema = z.enum(['coordinator', 'member']);
export type CircleRole = z.infer<typeof circleRoleSchema>;
export const CIRCLE_ROLE_LABELS: Record<CircleRole, string> = {
  coordinator: 'Circle coordinator',
  member: 'Member',
};

export const memberSharingPolicySchema = z.enum(['coordinators_only', 'all_members']);
export type MemberSharingPolicy = z.infer<typeof memberSharingPolicySchema>;

export const recordStatusSchema = z.enum(['active', 'archived']);
export type RecordStatus = z.infer<typeof recordStatusSchema>;

/**
 * Stations additionally support 'hypothetical': a planned station with a
 * location but no equipment yet, created so gear-up plans can analyze what
 * to buy before anything is on the air.
 */
export const stationStatusSchema = z.enum(['active', 'hypothetical', 'archived']);
export type StationStatus = z.infer<typeof stationStatusSchema>;
export const STATION_STATUS_LABELS: Record<StationStatus, string> = {
  active: 'Active',
  hypothetical: 'Planned (no equipment yet)',
  archived: 'Archived',
};

export const membershipStatusSchema = z.enum(['active', 'removed']);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const auditActionSchema = z.enum([
  'user.profile_updated',
  'station.created',
  'station.updated',
  'station.archived',
  'circle.created',
  'circle.updated',
  'member.added',
  'member.role_changed',
  'member.removed',
  'plan.generation_requested',
  'plan.published',
  'net.created',
  'net.updated',
  'net.archived',
  'net.session_opened',
  'net.session_closed',
  'net.checkin_recorded',
  'repeater.created',
  'repeater.updated',
  'repeater.deleted',
  'repeater.imported',
  'invite.created',
  'invite.accepted',
  'invite.revoked',
  'admin.granted',
  'admin.revoked',
  'settings.updated',
]);
export type AuditAction = z.infer<typeof auditActionSchema>;
