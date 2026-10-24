import { getSysDefaults } from './precision';

/** The user's time format, as Frappe's System Settings name it: `HH:mm:ss` or `HH:mm`. */
export function getTimeFormat(): string {
  return getSysDefaults().time_format || 'HH:mm:ss';
}

/** A Frappe Time value, like `9:30:00.123456`, as `HH:mm:ss`; microseconds are never shown. */
export function toTimeValue(value: string): string {
  const [hours, minutes = '00', seconds = '00'] = value
    .split('.')[0]
    .split(':');
  return [hours, minutes, seconds]
    .map((part) => part.padStart(2, '0'))
    .join(':');
}

/** A Time value in the user's time format. */
export function formatTime(value: string): string {
  const time = toTimeValue(value);
  return getTimeFormat() === 'HH:mm' ? time.slice(0, 5) : time;
}

/** Typed text, like `930`, `9:30 pm` or `21:30:15`, as `HH:mm:ss`; null when it is no time of day. */
export function parseTime(text: string): string | null {
  const match = text
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?:[:.]?(\d{2}))?(?::(\d{2}))?\s*(?:([ap])\.?m?\.?)?$/);
  if (!match) {
    return null;
  }

  const [, hourText, minutes = '00', seconds = '00', meridiem] = match;
  const hour = Number(hourText);
  const isHour = meridiem ? hour >= 1 && hour <= 12 : hour <= 23;
  if (!isHour || Number(minutes) > 59 || Number(seconds) > 59) {
    return null;
  }

  const hour24 = meridiem ? (hour % 12) + (meridiem === 'p' ? 12 : 0) : hour;
  return toTimeValue(`${hour24}:${minutes}:${seconds}`);
}

/** Half-hourly times of day, as `HH:mm`, to pick from. */
export function getTimeSlots(): string[] {
  return Array.from({ length: 48 }, (_, index) =>
    toTimeValue(`${Math.floor(index / 2)}:${index % 2 ? '30' : '00'}`).slice(
      0,
      5
    )
  );
}
