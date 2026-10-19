const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
function field(raw: string, min: number, max: number, names: readonly string[] = [], offset = 0): Set<number> {
  const result = new Set<number>();
  const number = (value: string) => {
    const named = names.indexOf(value.toUpperCase());
    if (named >= 0) return named + offset;
    if (!/^\d+$/.test(value)) throw new Error("cron");
    return Number(value);
  };
  for (const part of raw.replace(/^\?$/, "*").split(",")) {
    const pieces = part.split("/");
    if (pieces.length > 2) throw new Error("cron");
    const step = pieces[1] === undefined ? 1 : number(pieces[1]);
    if (step < 1 || step > max) throw new Error("cron");
    const range = pieces[0].split("-");
    const start = pieces[0] === "*" ? min : number(range[0]);
    const end = pieces[0] === "*" ? max : range.length === 2 ? number(range[1]) : pieces[1] ? max : start;
    if (range.length > 2 || start < min || end > max || start > end) throw new Error("cron");
    for (let n = start; n <= end; n += step) result.add(n);
  }
  return result;
}
function parse(expression: string) {
  const fields = expression.trim().split(/\s+/).map((value, index) => (index === 2 || index === 4) && value === "?" ? "*" : value);
  if (fields.length !== 5 || (fields[2] !== "*" && fields[4] !== "*")) throw new Error("cron");
  const [minute, hour, day, month, weekday] = fields;
  return { minute: field(minute, 0, 59), hour: field(hour, 0, 23), day: field(day, 1, 31), month: field(month, 1, 12, months, 1), weekday: field(weekday, 0, 6, weekdays) };
}
export function describeCron(expression: string): string {
  try { parse(expression); } catch { return "请输入有效的五段 cron"; }
  const [minute, hour, day, month, weekday] = expression.trim().split(/\s+/);
  if (day === "*" && month === "*" && weekday === "*") {
    if (/^\*\/\d+$/.test(minute) && hour === "*") return `每 ${minute.slice(2)} 分钟`;
    if (minute === "*" && hour === "*") return "每分钟";
    if (/^\d+$/.test(minute) && hour === "*") return `每小时第 ${minute} 分钟`;
    if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) return `每天 ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }
  return `分钟 ${minute}；小时 ${hour}；日期 ${day}；月份 ${month}；星期 ${weekday}`;
}
/** Match wall-clock fields against UTC instants: DST gaps are skipped and repeated times both fire. */
export function nextFires(expression: string, timezone: string, after = new Date(), count = 3): string[] {
  try {
    const cron = parse(expression);
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" });
    const parts = (ms: number) => Object.fromEntries(formatter.formatToParts(ms).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const matchingDay = (p: Record<string, number>) => cron.day.has(p.day) && cron.month.has(p.month) && cron.weekday.has(new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay());
    const matchingHour = (p: Record<string, number>) => cron.hour.has(p.hour) && matchingDay(p);
    const maxDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (![...cron.month].some((month) => [...cron.day].some((day) => day <= maxDays[month - 1]))) return [];
    const result: string[] = [];
    const start = Math.floor(after.getTime() / 3_600_000) * 3_600_000;
    // Allow up to five years per fire, so leap-day previews can include three occurrences.
    for (let day = start; day < start + count * 5 * 366 * 86_400_000 && result.length < count; day += 86_400_000) {
      // A UTC day can straddle local dates (and DST transitions). Check both ends and
      // the midpoint before skipping it; scan hours only on candidate days.
      if (![day, day + 12 * 3_600_000, day + 86_400_000 - 60_000].some((instant) => matchingDay(parts(instant)))) continue;
      for (let hour = day; hour < day + 86_400_000 && result.length < count; hour += 3_600_000) {
        const base = parts(hour);
        if (!matchingHour(base) && !matchingHour(parts(hour + 59 * 60_000))) continue;
        const minutes = [...cron.minute].map((minute) => (minute - base.minute + 60) % 60).sort((a, b) => a - b);
        for (const minute of minutes) {
          const instant = hour + minute * 60_000;
          if (instant <= after.getTime()) continue;
          const p = parts(instant);
          if (cron.minute.has(p.minute) && matchingHour(p)) result.push(new Date(instant).toISOString());
          if (result.length === count) break;
        }
      }
    }
    return result;
  } catch { return []; }
}
