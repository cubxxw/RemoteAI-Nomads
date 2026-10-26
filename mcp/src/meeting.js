// Same wall-clock/offset method as the existing meeting_hours tool; no network.
const problem = code => { throw Object.assign(new Error(code), {code}); };
export function convertMeeting(date, time, home, target) {
  const day = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== date) problem('INVALID_DATE');
  const [hour, minute] = time.split(':').map(Number);
  const wall = parts => Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const parts = (epoch, zone) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(epoch).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  try {
    const requested = day + hour * 3600000 + minute * 60000;
    const offsets = new Set();
    for (let h = -36; h <= 36; h += 6) { const at = requested + h * 3600000; offsets.add(wall(parts(at, home)) - at); }
    const matches = [...offsets].map(o => requested - o).filter(at => wall(parts(at, home)) === requested);
    if (!matches.length) problem('NONEXISTENT_HOME_TIME');
    if (matches.length > 1) problem('AMBIGUOUS_HOME_TIME');
    const local = parts(matches[0], target);
    return {home_date: date, home_time: time, home_timezone: home, city_timezone: target,
      local_date: local.year + '-' + local.month + '-' + local.day, local_time: local.hour + ':' + local.minute};
  } catch (error) {
    if (error.code) throw error;
    problem('INVALID_TIMEZONE');
  }
}
