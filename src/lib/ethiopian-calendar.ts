/**
 * Ethiopian ↔ Gregorian dates (F01-6, 2026-11-18): the date of birth is
 * entered in the Ethiopian calendar and stored once, in Gregorian, so the age
 * and youth checks and every report keep reading one date.
 *
 * Both go through the Julian day number. The Ethiopian year has twelve months
 * of 30 days and Pagume, of 5 days or 6 in the year before a Gregorian leap
 * year (year % 4 === 3).
 */

export type EthiopianDate = { year: number; month: number; day: number };

/** Julian day number of 1 Meskerem 1 (Amete Mihret). */
const EPOCH = 1724221;

export const ETHIOPIAN_MONTHS = [
  "Meskerem",
  "Tikimt",
  "Hidar",
  "Tahsas",
  "Tir",
  "Yekatit",
  "Megabit",
  "Miyazya",
  "Ginbot",
  "Sene",
  "Hamle",
  "Nehase",
  "Pagume",
] as const;

export function daysInEthiopianMonth(year: number, month: number): number {
  if (month < 13) return 30;
  return year % 4 === 3 ? 6 : 5;
}

function gregorianToJdn(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  );
}

function jdnToGregorian(jdn: number): { y: number; m: number; d: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    d: e - Math.floor((153 * m + 2) / 5) + 1,
    m: m + 3 - 12 * Math.floor(m / 10),
    y: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A real Ethiopian date, or false (13 Pagume, 31 Tir…). */
export function isEthiopianDate({ year, month, day }: EthiopianDate): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= 1 &&
    month >= 1 &&
    month <= 13 &&
    day >= 1 &&
    day <= daysInEthiopianMonth(year, month)
  );
}

/** Ethiopian date → "YYYY-MM-DD" (Gregorian), or "" when it is not a real date. */
export function ethiopianToIso(date: EthiopianDate): string {
  if (!isEthiopianDate(date)) return "";
  const jdn =
    EPOCH +
    365 * (date.year - 1) +
    Math.floor(date.year / 4) +
    30 * (date.month - 1) +
    date.day -
    1;
  const { y, m, d } = jdnToGregorian(jdn);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** "YYYY-MM-DD" (Gregorian) → Ethiopian date, or null when it is not a date. */
export function isoToEthiopian(iso: string): EthiopianDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const jdn = gregorianToJdn(Number(match[1]), Number(match[2]), Number(match[3]));
  // Counted from the start of the 4-year cycle before year 1 (EPOCH - 365).
  const since = jdn - (EPOCH - 365);
  const r = ((since % 1461) + 1461) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  return {
    year: 4 * Math.floor(since / 1461) + Math.floor(r / 365) - Math.floor(r / 1460),
    month: Math.floor(n / 30) + 1,
    day: (n % 30) + 1,
  };
}

/** "12 Hidar 1995 EC" for a stored Gregorian date; "" when there is none. */
export function formatEthiopian(iso: string | null | undefined): string {
  const ec = iso ? isoToEthiopian(iso.slice(0, 10)) : null;
  return ec ? `${ec.day} ${ETHIOPIAN_MONTHS[ec.month - 1]} ${ec.year} EC` : "";
}

/** The Ethiopian months in Amharic (Ge'ez script), for the Amharic screens. */
export const ETHIOPIAN_MONTHS_AM = [
  "መስከረም",
  "ጥቅምት",
  "ኅዳር",
  "ታኅሣሥ",
  "ጥር",
  "የካቲት",
  "መጋቢት",
  "ሚያዝያ",
  "ግንቦት",
  "ሰኔ",
  "ሐምሌ",
  "ነሐሴ",
  "ጳጉሜ",
] as const;

/** "12 ኅዳር 1995 ዓ.ም." for a stored Gregorian date; "" when there is none. */
export function formatEthiopianAm(iso: string | null | undefined): string {
  const ec = iso ? isoToEthiopian(iso.slice(0, 10)) : null;
  return ec ? `${ec.day} ${ETHIOPIAN_MONTHS_AM[ec.month - 1]} ${ec.year} ዓ.ም.` : "";
}
