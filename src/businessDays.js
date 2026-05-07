const FIXED_HOLIDAYS = ["01-01","04-21","05-01","09-07","10-12","11-02","11-15","12-25"];

function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function pad(n) { return String(n).padStart(2, "0"); }

function getHolidaysOfYear(year) {
  const set = new Set(FIXED_HOLIDAYS.map(d => year + "-" + d));
  const e = easter(year);
  const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  };
  set.add(addDays(e, -48));
  set.add(addDays(e, -47));
  set.add(addDays(e, -2));
  set.add(addDays(e, 60));
  return set;
}

export function isBusinessDay(date, holidays) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const key = date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  return !holidays.has(key);
}

export function getNthBusinessDay(year, month, n) {
  const holidays = getHolidaysOfYear(year);
  const lastDay = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day);
    if (isBusinessDay(d, holidays)) {
      count++;
      if (count === n) return day;
    }
  }
  return lastDay;
}
