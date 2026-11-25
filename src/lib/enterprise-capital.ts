/**
 * F02A-18 (backend 0138): the initial capital is asked in its parts; the API
 * (and the database) work the total out from them, as the web does.
 */
export const CAPITAL_PARTS = [
  { name: "capital_own", label: "Own contribution" },
  { name: "capital_loan", label: "Loan / credit" },
  { name: "capital_grant", label: "Grant / support" },
  { name: "capital_in_kind", label: "In-kind / productive assets" },
  { name: "capital_other", label: "Other start-up capital" },
] as const;
export type CapitalPart = (typeof CAPITAL_PARTS)[number]["name"];
export type CapitalForm = Record<CapitalPart, string>;

export const EMPTY_CAPITAL: CapitalForm = {
  capital_own: "",
  capital_loan: "",
  capital_grant: "",
  capital_in_kind: "",
  capital_other: "",
};

const amount = (v: string): number | null => {
  const t = v.replace(/,/g, "").trim();
  return t === "" || !Number.isFinite(Number(t)) ? null : Number(t);
};

/** A part that is not an amount of 0 or more, or null when all are fine (blank is fine). */
export function capitalError(form: CapitalForm): { field: CapitalPart; message: string } | null {
  for (const part of CAPITAL_PARTS) {
    const raw = form[part.name].replace(/,/g, "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return { field: part.name, message: `${part.label} must be a number, 0 or more` };
    if (n >= 1e13) return { field: part.name, message: `${part.label} is too large` };
  }
  return null;
}

/** The parts as the API takes them (a blank part is null). */
export function capitalPayload(form: CapitalForm): Record<CapitalPart, number | null> {
  return Object.fromEntries(CAPITAL_PARTS.map((p) => [p.name, amount(form[p.name])])) as Record<
    CapitalPart,
    number | null
  >;
}

/** The total the parts add up to, or null while none is typed. */
export function capitalTotal(form: CapitalForm): number | null {
  const parts = CAPITAL_PARTS.map((p) => amount(form[p.name])).filter((n): n is number => n !== null);
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100 : null;
}
