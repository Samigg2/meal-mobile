import type { ParticipantInput } from "./data";
import type { ProgrammeSettings } from "./reference";
import type { ParticipantRow } from "./types";
import type { GpsPoint } from "@/components/field-form";

/**
 * Shared by the registration form (participants/new.tsx) and the edit form
 * (participants/edit/[id].tsx): the DMIS F01 field shape, the same rules as
 * the API (participants.schemas.ts: f01Issues for every save, staffIssues for
 * a new registration), and the same request-body shaping, so the two forms
 * cannot drift apart on what "valid" means.
 */

/** A Yes/No question kept as text until answered ("" = not answered). */
export type YesNo = "" | "yes" | "no";

export interface FormState {
  /** F01-1 */
  has_fayida: YesNo;
  national_id: string;
  /** F01-2: typed; there is no link to JCMIS. */
  labour_id: string;
  kebele_id: string;
  /** F01-4: the full name is built from these three. */
  first_name: string;
  father_name: string;
  grandfather_name: string;
  /** Self-declared nationality, as on the Fayida ID. */
  nationality: string;
  date_of_birth: string;
  sex: "male" | "female" | undefined;
  marital_status: string;
  education_level: string;
  field_of_study: string;
  disability: boolean;
  /** F01-27: several can be ticked. */
  disability_types: string[];
  disability_other: string;
  target_status: string;
  female_headed: YesNo;
  has_dependents: YesNo;
  dependents_count: string;
  children_under_5: string;
  region: string;
  zone: string;
  woreda: string;
  /** Typed when the woreda is not in the reference list yet. */
  woreda_other: string;
  kebele: string;
  residence_type: string;
  phone: string;
  alternative_phone: string;
  email: string;
  registration_site: string;
  gps: GpsPoint | null;
  agri_experience: string;
  employment_preference: string;
  lead_firm_id: string;
  priority_1: string;
  priority_2: string;
  priority_3: string;
  consent_given: boolean;
  notes: string;
}

export const EMPTY: FormState = {
  has_fayida: "",
  national_id: "",
  labour_id: "",
  kebele_id: "",
  first_name: "",
  father_name: "",
  grandfather_name: "",
  nationality: "",
  date_of_birth: "",
  sex: undefined,
  marital_status: "",
  education_level: "",
  field_of_study: "",
  disability: false,
  disability_types: [],
  disability_other: "",
  target_status: "",
  female_headed: "",
  has_dependents: "",
  dependents_count: "",
  children_under_5: "",
  region: "",
  zone: "",
  woreda: "",
  woreda_other: "",
  kebele: "",
  residence_type: "",
  phone: "",
  alternative_phone: "",
  email: "",
  registration_site: "",
  gps: null,
  agri_experience: "",
  employment_preference: "",
  lead_firm_id: "",
  priority_1: "",
  priority_2: "",
  priority_3: "",
  consent_given: false,
  notes: "",
};

export const OTHER = "other";
/** F01-18: no field of study at these education levels (as on the server). */
export const NO_STUDY_LEVELS = ["unable_to_read_write", "primary"];
/** F01-29, fixed on the server. */
export const TARGET_STATUSES = [
  { label: "IDP", value: "idp" },
  { label: "Returnee", value: "returnee" },
  { label: "Not IDP or returnee", value: "neither" },
];
export const PREFERENCES = [
  { label: "Self (in a group)", value: "self" },
  { label: "Wage", value: "wage" },
];
export const YES_NO = [
  { label: "Yes", value: "yes" as const },
  { label: "No", value: "no" as const },
];
export const DEPENDENTS = { min: 1, max: 30 } as const;

/** 09…, 07…, +251… or the 12-digit 251… (the server stores 09…/07…). */
export const PHONE_RE = /^(?:\+?251|0)[79]\d{8}$/;
/** A stored +251 number shown in the 10-digit form. */
export const localPhone = (p?: string | null) => (p ?? "").replace(/[\s-]/g, "").replace(/^\+?251/, "0");
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PART_RE = /^[\p{L}\p{M}][\p{L}\p{M}'.-]*$/u;

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function newRef(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** The same day `years` ago, for the calendar's bounds. */
export function yearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function ageOn(dob: string, on = todayISO()): number {
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = on.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/** The three names as full_name stores them. */
export const joinedName = (f: Pick<FormState, "first_name" | "father_name" | "grandfather_name">) =>
  [f.first_name, f.father_name, f.grandfather_name].map((s) => s.trim()).filter(Boolean).join(" ");

/** A full name split into its parts (Fayida, and records from before F01, give one). */
export function splitName(full: string) {
  const [first = "", father = "", ...rest] = full.trim().split(/\s+/);
  return { first_name: first, father_name: father, grandfather_name: rest.join(" ") };
}

export type FormErrors = Partial<Record<keyof FormState | "form", string>>;

/**
 * The rules the API applies, so the field officer sees them before submitting.
 * "register" adds what F01 makes mandatory for a new registration (the API's
 * staffIssues); "edit" checks only what an edit of an older record can meet.
 * The age limits come from Programme settings (cached for offline use).
 */
export function validate(
  form: FormState,
  woredaListed: boolean,
  settings: ProgrammeSettings,
  mode: "register" | "edit" = "register",
): FormErrors {
  const errors: FormErrors = {};
  const blank = (v: string) => v.trim() === "";
  const register = mode === "register";
  const need = (key: keyof FormState, message: string) => {
    const v = form[key];
    if (typeof v === "string" && blank(v)) errors[key] = message;
  };

  // Identification
  if (register && !form.has_fayida) errors.has_fayida = "Say whether they have a Fayida ID.";
  if (form.national_id.trim() && !/^\d{12}$/.test(form.national_id.trim())) {
    errors.national_id = "A Fayida number has 12 digits.";
  } else if (form.has_fayida === "yes" && blank(form.national_id)) {
    errors.national_id = "Enter the Fayida number (FAN).";
  }
  if (blank(form.national_id) && blank(form.kebele_id)) {
    errors.kebele_id = form.has_fayida === "no" ? "Enter the Kebele ID." : "Enter a National ID or a Kebele ID.";
  }
  for (const [key, label] of [
    ["first_name", "First name"],
    ["father_name", "Father's name"],
    ["grandfather_name", "Grandfather's name"],
  ] as const) {
    const v = form[key].trim();
    if (!v) {
      if (register || key !== "grandfather_name") errors[key] = `${label} is required.`;
    } else if (!NAME_PART_RE.test(v)) errors[key] = "One name, letters only.";
  }

  // Personal
  if (!form.date_of_birth) errors.date_of_birth = "Date of birth is required.";
  else if (!isRealDate(form.date_of_birth)) errors.date_of_birth = "Pick the date of birth from the calendar.";
  else if (form.date_of_birth > todayISO()) errors.date_of_birth = "Date of birth cannot be in the future.";
  else {
    const age = ageOn(form.date_of_birth);
    const { participant_min_age: min, participant_max_age: max } = settings;
    if (age < min || age > max) errors.date_of_birth = `An age of ${age} is outside ${min} to ${max}. Check the date.`;
  }
  if (!form.sex) errors.sex = "Select the participant's sex.";
  if (register) {
    need("marital_status", "Marital status is required.");
    need("education_level", "Education level is required.");
  }
  if (form.field_of_study && NO_STUDY_LEVELS.includes(form.education_level)) {
    errors.field_of_study = "No field of study at this education level.";
  }
  if (form.disability && form.disability_types.length === 0) errors.disability_types = "Tick at least one impairment.";
  if (form.disability && form.disability_types.includes(OTHER) && blank(form.disability_other)) {
    errors.disability_other = "Say what the other impairment is.";
  }

  // Household
  if (register) {
    need("target_status", "Target status is required.");
    if (!form.female_headed) errors.female_headed = "Answer Yes or No.";
    if (!form.has_dependents) errors.has_dependents = "Answer Yes or No.";
  }
  if (form.has_dependents === "yes") {
    const n = Number(form.dependents_count);
    const u5 = Number(form.children_under_5);
    if (blank(form.dependents_count)) errors.dependents_count = "How many dependents?";
    else if (!Number.isInteger(n) || n < DEPENDENTS.min || n > DEPENDENTS.max) {
      errors.dependents_count = `A whole number from ${DEPENDENTS.min} to ${DEPENDENTS.max}.`;
    }
    if (blank(form.children_under_5)) errors.children_under_5 = "How many children under 5? (0 if none)";
    else if (!Number.isInteger(u5) || u5 < 0) errors.children_under_5 = "A whole number, 0 or more.";
    else if (!errors.dependents_count && u5 > n) errors.children_under_5 = "Cannot be more than the dependents.";
  }

  // Location and contact
  if (!form.region) errors.region = "Region is required.";
  if (!form.zone.trim()) errors.zone = "Zone is required.";
  if (!form.woreda || (form.woreda === OTHER && !form.woreda_other.trim())) {
    errors.woreda = woredaListed ? "Woreda is required." : "Type the woreda.";
  }
  if (register) {
    need("kebele", "Kebele is required.");
    need("residence_type", "Choose rural, peri-urban or urban.");
  }
  const phone = form.phone.replace(/[\s-]/g, "");
  if (!phone) errors.phone = "Phone is required.";
  else if (!PHONE_RE.test(phone)) errors.phone = "Use 09… or 07… (10 digits), or 2519… (12 digits).";
  const alt = form.alternative_phone.replace(/[\s-]/g, "");
  if (alt && !PHONE_RE.test(alt)) errors.alternative_phone = "Use 09… or 07… (10 digits), or 2519… (12 digits).";
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errors.email = "Enter a valid email address.";
  if (register && !form.gps) errors.gps = "Take the GPS point of the registration site.";

  // Livelihood
  if (register) {
    need("agri_experience", "Agri-business experience is required.");
    need("employment_preference", "Choose Self or Wage.");
    need("priority_1", "1st priority is required.");
    need("priority_2", "2nd priority is required.");
    need("priority_3", "3rd priority is required.");
  }
  if (form.priority_2 && form.priority_2 === form.priority_1) errors.priority_2 = "Choose a different sector from the 1st.";
  if (form.priority_3 && (form.priority_3 === form.priority_1 || form.priority_3 === form.priority_2)) {
    errors.priority_3 = "Choose a sector not already chosen.";
  }

  if (register && !form.consent_given) {
    errors.consent_given = "Informed consent is required before registering anyone.";
  }
  return errors;
}

const yesNo = (v: YesNo) => (v === "yes" ? true : v === "no" ? false : undefined);

/**
 * Builds the API body: empty optional fields are left out rather than sent as
 * "". Status is deliberately not set here: the create screen always wants
 * "active" (added by its own caller) and the edit screen must never touch it,
 * since a stored participant can also be "graduated" or "dropped".
 */
export function toInput(form: FormState, clientRef?: string): Omit<ParticipantInput, "status"> {
  const text = (v: string) => (v.trim() ? v.trim() : undefined);
  const dependents = form.has_dependents === "yes";
  const wage = form.employment_preference === "wage";
  const studies = !NO_STUDY_LEVELS.includes(form.education_level);
  return {
    client_ref: clientRef,
    has_fayida: yesNo(form.has_fayida),
    // The number only when they said they have one; a Kebele ID otherwise.
    national_id: form.has_fayida === "no" ? undefined : text(form.national_id),
    kebele_id: text(form.kebele_id),
    labour_id: text(form.labour_id),
    first_name: form.first_name.trim(),
    father_name: form.father_name.trim(),
    grandfather_name: text(form.grandfather_name),
    full_name: joinedName(form),
    nationality: text(form.nationality),
    date_of_birth: form.date_of_birth,
    sex: form.sex as "male" | "female",
    marital_status: text(form.marital_status),
    education_level: text(form.education_level),
    field_of_study: studies ? text(form.field_of_study) : undefined,
    disability: form.disability,
    disability_type: form.disability ? form.disability_types : [],
    disability_type_other:
      form.disability && form.disability_types.includes(OTHER) ? text(form.disability_other) : undefined,
    target_status: text(form.target_status) as ParticipantInput["target_status"],
    female_headed: yesNo(form.female_headed),
    has_dependents: yesNo(form.has_dependents),
    dependents_count: dependents && form.dependents_count.trim() ? Number(form.dependents_count) : null,
    children_under_5: dependents && form.children_under_5.trim() ? Number(form.children_under_5) : null,
    region: form.region,
    zone: form.zone.trim(),
    woreda: form.woreda === OTHER ? form.woreda_other.trim() : form.woreda,
    kebele: text(form.kebele),
    residence_type: text(form.residence_type),
    phone: form.phone.replace(/[\s-]/g, ""),
    alternative_phone: text(form.alternative_phone.replace(/[\s-]/g, "")),
    email: text(form.email),
    registration_site: text(form.registration_site),
    gps_lat: form.gps?.latitude ?? null,
    gps_lng: form.gps?.longitude ?? null,
    agri_experience: text(form.agri_experience),
    employment_preference: text(form.employment_preference) as ParticipantInput["employment_preference"],
    lead_firm_id: wage ? text(form.lead_firm_id) : undefined,
    priority_1: text(form.priority_1),
    priority_2: text(form.priority_2),
    priority_3: text(form.priority_3),
    consent_given: form.consent_given,
    notes: text(form.notes),
  };
}

const answer = (v: boolean | null | undefined): YesNo => (v === true ? "yes" : v === false ? "no" : "");

/** A stored record (or a waiting change on top of one) as the form edits it. */
export function fromRecord(
  p: Partial<ParticipantRow> & Record<string, unknown>,
  woredasOf: (zone: string) => { value: string }[],
): FormState {
  const listed = !p.woreda || woredasOf(String(p.zone ?? "")).some((w) => w.value === p.woreda);
  const types = p.disability_type;
  const names =
    p.first_name || p.father_name
      ? { first_name: String(p.first_name ?? ""), father_name: String(p.father_name ?? ""), grandfather_name: String(p.grandfather_name ?? "") }
      : splitName(String(p.full_name ?? ""));
  const gps =
    typeof p.gps_lat === "number" && typeof p.gps_lng === "number"
      ? { latitude: p.gps_lat, longitude: p.gps_lng, accuracy: 0 }
      : typeof p.gps_lat === "string" && typeof p.gps_lng === "string"
        ? { latitude: Number(p.gps_lat), longitude: Number(p.gps_lng), accuracy: 0 }
        : null;
  return {
    ...EMPTY,
    ...names,
    has_fayida: answer(p.has_fayida as boolean | null | undefined),
    national_id: String(p.national_id ?? ""),
    labour_id: String(p.labour_id ?? ""),
    kebele_id: String(p.kebele_id ?? ""),
    nationality: String(p.nationality ?? ""),
    date_of_birth: String(p.date_of_birth ?? ""),
    sex: (p.sex as "male" | "female" | null) ?? undefined,
    marital_status: String(p.marital_status ?? ""),
    education_level: String(p.education_level ?? ""),
    field_of_study: String(p.field_of_study ?? ""),
    disability: !!p.disability,
    disability_types: Array.isArray(types) ? types.map(String) : types ? [String(types)] : [],
    disability_other: String(p.disability_type_other ?? ""),
    target_status: String(p.target_status ?? ""),
    female_headed: answer(p.female_headed as boolean | null | undefined),
    has_dependents: answer(p.has_dependents as boolean | null | undefined),
    dependents_count: p.dependents_count != null ? String(p.dependents_count) : "",
    children_under_5: p.children_under_5 != null ? String(p.children_under_5) : "",
    region: String(p.region ?? ""),
    zone: String(p.zone ?? ""),
    woreda: listed ? String(p.woreda ?? "") : "",
    kebele: String(p.kebele ?? ""),
    residence_type: String(p.residence_type ?? ""),
    phone: localPhone(p.phone as string | null | undefined),
    alternative_phone: localPhone(p.alternative_phone as string | null | undefined),
    email: String(p.email ?? ""),
    registration_site: String(p.registration_site ?? ""),
    gps,
    agri_experience: String(p.agri_experience ?? ""),
    employment_preference: String(p.employment_preference ?? ""),
    lead_firm_id: String(p.lead_firm_id ?? ""),
    priority_1: String(p.priority_1 ?? ""),
    priority_2: String(p.priority_2 ?? ""),
    priority_3: String(p.priority_3 ?? ""),
    consent_given: !!p.consent_given,
    notes: String(p.notes ?? ""),
  };
}

/** The register in six steps, as on the web: shared by the add and edit screens. Next checks only that step's fields. */
export const STEPS = ["Identification", "Personal", "Household", "Location", "Livelihood", "Consent"];
export const STEP_FIELDS: string[][] = [
  ["has_fayida", "national_id", "kebele_id", "labour_id", "first_name", "father_name", "grandfather_name"],
  [
    "date_of_birth",
    "sex",
    "nationality",
    "marital_status",
    "education_level",
    "field_of_study",
    "disability",
    "disability_types",
    "disability_other",
  ],
  ["target_status", "female_headed", "has_dependents", "dependents_count", "children_under_5"],
  [
    "region",
    "zone",
    "woreda",
    "woreda_other",
    "kebele",
    "residence_type",
    "phone",
    "alternative_phone",
    "email",
    "registration_site",
    "gps",
  ],
  ["agri_experience", "employment_preference", "lead_firm_id", "priority_1", "priority_2", "priority_3"],
  ["consent_given", "notes"],
];
/** The first step holding one of the fields in `found`, or -1. */
export const stepOf = (found: Record<string, unknown>) =>
  STEP_FIELDS.findIndex((names) => names.some((n) => n in found));
