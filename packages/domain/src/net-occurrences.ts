/**
 * Computes upcoming occurrences of a recurring net from its recurrence
 * rule. Occurrences are never materialized as database rows -- both the
 * API (upcoming lists) and the frontend derive them from the same rule via
 * this module.
 *
 * Timezone handling uses only Intl (no dependencies): a net is scheduled
 * as a wall-clock time in an IANA timezone, so the UTC instant of each
 * occurrence shifts across DST transitions while the local time stays put.
 */

export type NetFrequency = 'weekly' | 'biweekly' | 'monthly';

export interface NetRecurrenceRule {
  frequency: NetFrequency;
  /** Date of the first occurrence, YYYY-MM-DD (in the net's timezone). */
  firstOccursOn: string;
  /** Local wall-clock start time, "HH:MM" 24h. */
  timeLocal: string;
  /** IANA timezone identifier, e.g. "America/Chicago". */
  timezone: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timezone` from UTC at `date`, in milliseconds (positive = ahead of UTC). */
function timezoneOffsetMs(date: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** UTC instant of the given wall-clock time in `timezone` (DST-aware). */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes converge on the correct offset even right around a DST jump.
  let ts = naive;
  for (let i = 0; i < 2; i++) {
    ts = naive - timezoneOffsetMs(new Date(ts), timezone);
  }
  return new Date(ts);
}

interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

function parseDate(value: string): CalendarDate {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) throw new Error(`Invalid date: ${value}`);
  return { year, month, day };
}

function parseTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(':').map(Number);
  if (hour === undefined || Number.isNaN(hour) || minute === undefined || Number.isNaN(minute)) {
    throw new Error(`Invalid time: ${value}`);
  }
  return { hour, minute };
}

/** Calendar arithmetic done in UTC to avoid host-timezone interference. */
function toUtcMidnight(d: CalendarDate): number {
  return Date.UTC(d.year, d.month - 1, d.day);
}

function fromUtcMidnight(ts: number): CalendarDate {
  const date = new Date(ts);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * The nth occurrence of `weekday` (0=Sunday) in a month, clamping to the
 * last occurrence when the month has no nth one (e.g. a "5th Friday"
 * anchor falls back to the 4th Friday in shorter months).
 */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): CalendarDate {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekdayDay = 1 + ((weekday - firstOfMonth.getUTCDay() + 7) % 7);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let day = firstWeekdayDay + (nth - 1) * 7;
  while (day > daysInMonth) day -= 7;
  return { year, month, day };
}

function occurrenceInstant(d: CalendarDate, rule: NetRecurrenceRule): Date {
  const { hour, minute } = parseTime(rule.timeLocal);
  return zonedTimeToUtc(d.year, d.month, d.day, hour, minute, rule.timezone);
}

/**
 * The next `count` occurrences of the rule at or after `from`.
 * Returned in chronological order as UTC instants.
 */
export function nextOccurrences(rule: NetRecurrenceRule, from: Date, count: number): Date[] {
  if (count <= 0) return [];
  const anchor = parseDate(rule.firstOccursOn);
  const results: Date[] = [];

  if (rule.frequency === 'weekly' || rule.frequency === 'biweekly') {
    const stepDays = rule.frequency === 'weekly' ? 7 : 14;
    const anchorTs = toUtcMidnight(anchor);
    // Jump close to `from` instead of iterating from a possibly-old anchor;
    // back off two steps to be safe around timezone offsets.
    const roughSteps = Math.floor((from.getTime() - anchorTs) / (stepDays * DAY_MS)) - 2;
    let k = Math.max(0, roughSteps);
    while (results.length < count) {
      const instant = occurrenceInstant(fromUtcMidnight(anchorTs + k * stepDays * DAY_MS), rule);
      if (instant.getTime() >= from.getTime()) results.push(instant);
      k += 1;
    }
    return results;
  }

  // Monthly: the anchor's nth-weekday-of-month.
  const anchorWeekday = new Date(toUtcMidnight(anchor)).getUTCDay();
  const anchorNth = Math.floor((anchor.day - 1) / 7) + 1;
  const anchorMonthIndex = anchor.year * 12 + (anchor.month - 1);
  const fromMonthIndex = from.getUTCFullYear() * 12 + from.getUTCMonth();
  let monthIndex = Math.max(anchorMonthIndex, fromMonthIndex - 1);
  while (results.length < count) {
    const year = Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const d = nthWeekdayOfMonth(year, month, anchorWeekday, anchorNth);
    if (toUtcMidnight(d) >= toUtcMidnight(anchor)) {
      const instant = occurrenceInstant(d, rule);
      if (instant.getTime() >= from.getTime()) results.push(instant);
    }
    monthIndex += 1;
  }
  return results;
}
