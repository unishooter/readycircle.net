import type { PlanAdvisory } from '@readycircle/contracts';
import type { EngineLogger, PlanContext } from './types.js';

/**
 * Produces the advisory (recommendation) sections of a plan from an
 * assembled context. The OpenAI implementation lives in
 * `openai-provider.ts`; tests use simple stubs.
 */
export interface AdvisoryProvider {
  generateAdvisory(context: PlanContext): Promise<PlanAdvisory>;
}

export const ADVISORY_SYSTEM_PROMPT = `You are an experienced emergency communications planner helping a small neighborhood or family radio group ("Radio Circle") prepare a practical communications plan.

You will receive structured JSON describing the group: its purpose, area, and each member station's radio capabilities, license/authorization, experience level, location (coarse area or 1km MGRS grid only), goals, and participation preferences.

Produce advisory content following these hard rules:
- Only reference stations that appear in the provided roster, always by their exact stationId and stationName.
- Respect US radio regulations: FRS needs no license; GMRS transmission requires a GMRS license; amateur bands require the appropriate amateur license class. Never assign a station to transmit on a service it is not authorized for. Receive-only stations must never be assigned transmit roles.
- Prefer channels/services that the most members share, with a primary channel usable by everyone who can transmit, plus a backup. Use specific, real channel numbers and frequencies (e.g. "FRS channel 3 (462.6125 MHz)").
- For role assignments, prefer stations that indicated willingness (net control / relay), breaking ties by experience and license class. Do not invent roles for unwilling or receive-only stations, except that receive-only stations may be acknowledged as monitoring positions in the narrative.
- Keep the check-in schedule realistic for a volunteer group and describe a short, simple net procedure a beginner can follow.
- In recommendations, identify genuine gaps (coverage, licensing, redundancy, equipment) with practical, low-cost next steps. Be specific to this group, not generic.
- Write plainly for radio beginners. Avoid jargon without explanation. Keep each narrative under 150 words.`;

export function buildAdvisoryUserPrompt(context: PlanContext): string {
  return [
    'Create the advisory sections of a communications plan for this Radio Circle.',
    '',
    'Circle and roster data (JSON):',
    JSON.stringify(context, null, 2),
  ].join('\n');
}

/**
 * Post-generation guardrail: drop any role assignment that references a
 * station not present in the roster (or a receive-only station), rather
 * than persisting content the model invented. Throws only when nothing
 * usable remains, so a single bad reference does not waste the generation.
 */
export function validateAdvisoryStationRefs(
  advisory: PlanAdvisory,
  context: PlanContext,
  logger?: EngineLogger,
): PlanAdvisory {
  const stationsById = new Map(context.members.map((member) => [member.stationId, member]));

  const validAssignments = advisory.roleAssignments.assignments.filter((assignment) => {
    const station = stationsById.get(assignment.stationId);
    if (!station) {
      logger?.warn(
        { stationId: assignment.stationId, role: assignment.role },
        'advisory referenced unknown station; dropping assignment',
      );
      return false;
    }
    if (station.receiveOnly) {
      logger?.warn(
        { stationId: assignment.stationId, role: assignment.role },
        'advisory assigned a transmit role to a receive-only station; dropping assignment',
      );
      return false;
    }
    return true;
  });

  if (advisory.roleAssignments.assignments.length > 0 && validAssignments.length === 0) {
    throw new Error('AI advisory referenced only unknown or receive-only stations in role assignments.');
  }

  return {
    ...advisory,
    roleAssignments: { ...advisory.roleAssignments, assignments: validAssignments },
  };
}
