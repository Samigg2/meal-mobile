import type { ParticipantInput } from "./data";
import type { ProgrammeSettings } from "./reference";

/**
 * Shared by the registration form (participants/new.tsx) and the edit form
 * (participants/edit/[id].tsx): the same field shape, the same validation
 * rules as the API (participants.schemas.ts), and the same request-body
 * shaping, so the two forms cannot drift apart on what "valid" means.
 */

export interface FormState {
  full_name: string;
  national_id: string;
  kebele_id: string;
  date_of_birth: string;
  sex: "male" | "female" | undefined;
  region: string;
  zone: string;
  woreda: string;
  /** Typed when the woreda is not in the reference list yet. */
  woreda_other: string;
  kebele: string;
  phone: string;
  email: string;
  education_level: string;
  marital_status: string;
  family_size: string;
  vulnerability_category: string;
  /** Free text, used when the category is "other". */
  vulnerability_other: string;
  disability: boolean;
  disability_type: string;
  disability_other: string;
  consent_given: boolean;
  notes: string;
}

export const EMPTY: FormState = {
  full_name: "",
  national_id: "",
  kebele_id: "",
  date_of_birth: "",
  sex: undefined,
  region: "",
  zone: "",
  woreda: "",
  woreda_other: "",
  kebele: "",
  phone: "",
  email: "",
  education_level: "",
  marital_status: "",
  family_size: "",
  vulnerability_category: "",
  vulnerability_other: "",
  disability: false,
  disability_type: "",
  disability_other: "",
  consent_given: false,
  notes: "",
};

export const OTHER = "other";
export const PHONE_RE = /^(?:\+251|0)[79]\d{8}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export type FormErrors = Partial<Record<keyof FormState | "form", string>>;

/**
 * The rules the API applies, so the field officer sees them before submitting.
 * The age limits come from Programme settings (cached for offline use), the
 * same values the database checks.
 */
export function validate(form: FormState, woredaListed: boolean, settings: ProgrammeSettings): FormErrors {
  const errors: FormErrors = {};
  if (!form.full_name.trim()) errors.full_name = "Full name is required.";
  else if (form.full_name.trim().split(/\s+/).length < 2) {
    errors.full_name = "Enter the full name (given name and father's name).";
  }

  if (!form.national_id.trim() && !form.kebele_id.trim()) {
    errors.national_id = "Enter a National ID or a Kebele ID.";
    errors.kebele_id = "Enter a National ID or a Kebele ID.";
  } else if (form.national_id.trim() && form.national_id.trim().length !== 12) {
    errors.national_id = "A National ID has 12 characters.";
  }

  if (!form.date_of_birth) errors.date_of_birth = "Date of birth is required.";
  else if (!isRealDate(form.date_of_birth)) errors.date_of_birth = "Pick the date of birth from the calendar.";
  else if (form.date_of_birth > todayISO()) errors.date_of_birth = "Date of birth cannot be in the future.";
  else {
    const age = ageOn(form.date_of_birth);
    const { participant_min_age: min, participant_max_age: max } = settings;
    if (age < min || age > max) {
      errors.date_of_birth = `An age of ${age} is outside ${min} to ${max}. Check the date.`;
    }
  }

  if (!form.sex) errors.sex = "Select the participant's sex.";

  if (!form.region) errors.region = "Region is required.";
  if (!form.zone.trim()) errors.zone = "Zone is required.";
  if (!form.woreda || (form.woreda === OTHER && !form.woreda_other.trim())) {
    errors.woreda = woredaListed ? "Woreda is required." : "Type the woreda.";
  }

  if (!form.phone.trim()) errors.phone = "Phone is required.";
  else if (!PHONE_RE.test(form.phone.replace(/[\s-]/g, ""))) errors.phone = "Use 0912345678 or +251912345678.";

  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errors.email = "Enter a valid email address.";

  if (form.family_size.trim()) {
    const n = Number(form.family_size);
    if (!Number.isInteger(n) || n < 1 || n > 50) errors.family_size = "Enter a whole number from 1 to 50.";
  }

  if (form.vulnerability_category === OTHER && !form.vulnerability_other.trim()) {
    errors.vulnerability_other = "Describe the category.";
  }
  if (form.disability && !form.disability_type) errors.disability_type = "Select the type of disability.";
  if (form.disability && form.disability_type === OTHER && !form.disability_other.trim()) {
    errors.disability_other = "Describe the disability.";
  }

  if (!form.consent_given) {
    errors.consent_given = "Informed consent is required before registering anyone.";
  }
  return errors;
}

/**
 * Builds the API body: empty optional fields are left out rather than sent as
 * "". Status is deliberately not set here — the create screen always wants
 * "active" (added by its own caller) and the edit screen must never touch it:
 * the API only accepts "active"/"inactive" here, but a stored participant can
 * also be "graduated" or "dropped", and resending an assumed status would
 * silently un-graduate someone. Leaving it out keeps whatever the record
 * already has.
 */
export function toInput(form: FormState, clientRef?: string): Omit<ParticipantInput, "status"> {
  const text = (v: string) => (v.trim() ? v.trim() : undefined);
  const vulnerability =
    form.vulnerability_category === OTHER
      ? text(form.vulnerability_other)
      : form.vulnerability_category === "none"
        ? undefined
        : text(form.vulnerability_category);
  const disabilityType = !form.disability
    ? undefined
    : form.disability_type === OTHER
      ? text(form.disability_other)
      : text(form.disability_type);

  return {
    client_ref: clientRef,
    full_name: form.full_name.trim().replace(/\s+/g, " "),
    national_id: text(form.national_id),
    kebele_id: text(form.kebele_id),
    date_of_birth: form.date_of_birth,
    sex: form.sex as "male" | "female",
    region: form.region,
    zone: form.zone.trim(),
    woreda: form.woreda === OTHER ? form.woreda_other.trim() : form.woreda,
    kebele: text(form.kebele),
    phone: form.phone.replace(/[\s-]/g, ""),
    email: text(form.email),
    disability: form.disability,
    disability_type: disabilityType,
    education_level: text(form.education_level),
    marital_status: text(form.marital_status),
    family_size: form.family_size.trim() ? Number(form.family_size) : undefined,
    vulnerability_category: vulnerability,
    consent_given: form.consent_given,
    notes: text(form.notes),
  };
}
