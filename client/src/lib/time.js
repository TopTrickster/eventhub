// Dates are stored in UTC and shown in Europe/Sofia, whatever time zone the browser is in.
// The form's datetime-local value is read as Sofia wall-clock time, not browser time.

export const TIME_ZONE = 'Europe/Sofia';

const display = new Intl.DateTimeFormat('bg-BG', { timeZone: TIME_ZONE, dateStyle: 'full', timeStyle: 'short' });
const wallClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDateTime = (iso) => display.format(new Date(iso));

const partsOf = (instant) => Object.fromEntries(wallClock.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));

/** "2026-11-05T18:00" in Sofia for a UTC instant, the format a datetime-local input wants. */
export function toSofiaInput(iso) {
  const p = partsOf(iso);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** The UTC ISO string for a Sofia wall-clock "YYYY-MM-DDTHH:mm"; '' stays '' for the server to reject. */
export function fromSofiaInput(value) {
  if (!value) return '';
  const [y, m, d, hh, mm] = value.split(/[-T:]/).map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (instant) => {
    const p = partsOf(instant);
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - instant;
  };
  // Twice, because the offset can differ on either side of a daylight-saving switch.
  const first = asUtc - offsetAt(asUtc);
  return new Date(asUtc - offsetAt(first)).toISOString();
}
