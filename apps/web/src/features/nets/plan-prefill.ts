import {
  channelPlanContentSchema,
  checkInScheduleContentSchema,
  type NetFrequency,
  type PlanVersionDetail,
} from '@readycircle/contracts';

export interface NetPrefill {
  name?: string;
  channel?: string;
  frequency?: NetFrequency;
  firstOccursOn?: string;
  timeLocal?: string;
  durationMinutes?: number;
  procedure?: string[];
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseFrequency(cadence: string): NetFrequency | undefined {
  const lower = cadence.toLowerCase();
  if (lower.includes('biweek') || lower.includes('every two') || lower.includes('every other')) return 'biweekly';
  if (lower.includes('month')) return 'monthly';
  if (lower.includes('week')) return 'weekly';
  return undefined;
}

/** "Sundays at 19:00 local time" -> weekday index; undefined when no weekday named. */
function parseWeekday(dayAndTime: string): number | undefined {
  const lower = dayAndTime.toLowerCase();
  const index = WEEKDAYS.findIndex((day) => lower.includes(day));
  return index === -1 ? undefined : index;
}

/** "…at 19:00…" or "…at 7:30 PM…" -> "HH:MM"; undefined when no time found. */
function parseTime(dayAndTime: string): string | undefined {
  const match = /(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(dayAndTime);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23) return undefined;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

/** The next calendar date (YYYY-MM-DD, local) falling on `weekday`, starting tomorrow. */
function nextDateForWeekday(weekday: number, from = new Date()): string {
  const date = new Date(from);
  do {
    date.setDate(date.getDate() + 1);
  } while (date.getDay() !== weekday);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Best-effort prefill of the net form from a published plan version: the
 * check-in schedule section's free-text cadence/day/time plus the channel
 * plan's primary entry. Anything that can't be parsed is simply left for
 * the user to fill in.
 */
export function prefillFromPlanVersion(version: PlanVersionDetail, circleName: string): NetPrefill {
  const prefill: NetPrefill = { name: `${circleName} net` };

  const checkInSection = version.sections.find((section) => section.sectionKey === 'check_in_schedule');
  if (checkInSection) {
    const parsed = checkInScheduleContentSchema.safeParse(checkInSection.content);
    if (parsed.success) {
      prefill.frequency = parseFrequency(parsed.data.cadence);
      prefill.durationMinutes = parsed.data.durationMinutes;
      prefill.procedure = parsed.data.procedure;
      const time = parseTime(parsed.data.dayAndTime);
      if (time) prefill.timeLocal = time;
      const weekday = parseWeekday(parsed.data.dayAndTime);
      if (weekday !== undefined) prefill.firstOccursOn = nextDateForWeekday(weekday);
    }
  }

  const channelSection = version.sections.find((section) => section.sectionKey === 'channel_plan');
  if (channelSection) {
    const parsed = channelPlanContentSchema.safeParse(channelSection.content);
    const primary = parsed.success
      ? (parsed.data.entries.find((entry) => entry.purpose === 'primary') ?? parsed.data.entries[0])
      : undefined;
    if (primary) {
      prefill.channel = `${primary.channelOrFrequency} (${primary.service})`;
    }
  }

  return prefill;
}
