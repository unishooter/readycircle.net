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

You will receive structured JSON describing the group: its purpose, area, each member station's radio capabilities, license/authorization, experience level, location (coarse area or 1km MGRS grid only), goals, participation preferences, antenna/power attributes, and declared repeater access; the Circle's repeater directory; the scenario the plan targets; and a deterministic connectivity analysis (pairwise link verdicts, relay/coverage gaps) computed by the application.

Produce advisory content following these hard rules:
- Only reference stations that appear in the provided roster, always by their exact stationId and stationName.
- Respect US radio regulations: FRS needs no license; GMRS transmission requires a GMRS license; amateur bands require the appropriate amateur license class. Never assign a station to transmit on a service it is not authorized for. Receive-only stations must never be assigned transmit roles.
- Assume any station listing GMRS capability is covered by a family GMRS license (one GMRS license covers the licensee's immediate family members), even if the station's stated authorization does not mention GMRS. Treat those stations as authorized for GMRS transmission.
- Prefer channels/services that the most members share, with a primary channel usable by everyone who can transmit, plus a backup. Use specific, real channel numbers and frequencies (e.g. "FRS channel 3 (462.6125 MHz)"). When the Circle's repeater directory lists repeaters that member stations can use, prefer them for wide-area coverage and include the tone/offset from the directory.
- For role assignments, prefer stations that indicated willingness (net control / relay), breaking ties by experience and license class. Do not invent roles for unwilling or receive-only stations, except that receive-only stations may be acknowledged as monitoring positions in the narrative.
- Keep the check-in schedule realistic for a volunteer group and describe a short, simple net procedure a beginner can follow.
- Treat the connectivity analysis as ground truth: do not contradict its verdicts, and address its gaps directly in gear recommendations.
- Gear recommendations: assume the baseline station is a UV-5R-class GMRS + dual-band (2m/70cm) handheld. Recommend generic gear classes and capabilities only -- e.g. "a 50 W GMRS mobile radio with a dual-band base antenna at about 20 ft" -- never brand names or model numbers. Stations marked hypothetical are planned stations with no equipment yet: recommend a complete, prioritized gear-up list for them, sized to close the gaps the connectivity analysis found. Key backup power, satellite (internet or phone), and mesh recommendations to the scenario's circumstances and duration: a multi-week power outage warrants generators/solar; loss of internet with a working grid favors satellite internet at one or two well-placed stations; mesh nodes suit dense neighborhoods.
- In recommendations, identify genuine gaps (coverage, licensing, redundancy, equipment) with practical, low-cost next steps. Be specific to this group, not generic.
- Write plainly for radio beginners. Avoid jargon without explanation. Keep each narrative under 150 words.`;

export function buildAdvisoryUserPrompt(context: PlanContext): string {
  const lines = [
    'Create the advisory sections of a communications plan for this Radio Circle.',
    '',
  ];
  if (context.scenarioDescription) {
    lines.push(`Plan for this scenario: ${context.scenarioDescription}`, '');
  }
  lines.push('Circle, roster, repeater, scenario, and connectivity data (JSON):', JSON.stringify(context, null, 2));
  return lines.join('\n');
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
