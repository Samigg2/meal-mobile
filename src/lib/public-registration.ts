import { api } from "./api";
import { secureStorage } from "./storage";
import { OTHER } from "./participant-form";

/**
 * A young person registering herself, with no account. The same public API
 * as the web form (meal-mis-frontend/src/routes/register.tsx): she proves her
 * phone number with an SMS code, may check her National ID with the ID
 * service, and the registration waits for a programme officer's review. It
 * counts in nothing until approved.
 */

export interface ListOption {
  code: string;
  label: string;
}

/** A zone or woreda, with the code of the region or zone it belongs to. */
export interface ChildOption extends ListOption {
  parent: string | null;
}

export interface RegistrationOptions {
  /** Which proofs the API can ask for. Without phone, registration is closed. */
  verification: { phone: boolean; fayida: boolean };
  regions: ListOption[];
  /** A region covered by several clusters asks the person which one is hers. */
  clusters: { id: string; name: string; region: string }[];
  /** Reference data: where a region has zones listed, the zone must be one of them. */
  zones: ChildOption[];
  /** Partial: a woreda that is not listed can be typed. */
  woredas: ChildOption[];
  education_levels: ListOption[];
  marital_statuses: ListOption[];
  vulnerability_categories: ListOption[];
}

/** The optional "about you" answers, each a code from its list. */
export interface RegistrationAnswers {
  education_level?: string;
  marital_status?: string;
  vulnerability_category?: string;
}

export interface RegistrationInput extends RegistrationAnswers {
  full_name: string;
  sex: "male" | "female";
  date_of_birth: string;
  phone: string;
  national_id?: string;
  kebele_id?: string;
  region: string;
  zone: string;
  woreda: string;
  kebele?: string;
  disability: boolean;
  organization_id?: string;
  consent_given: true;
  /** One-time proof of the phone number. */
  verification_token: string;
  /** One-time proof of the National ID (optional). */
  fayida_token?: string;
}

export interface IdDetails {
  full_name?: string;
  date_of_birth?: string;
  sex?: "male" | "female";
  region?: string;
  zone?: string;
  woreda?: string;
  kebele?: string;
}

export type RegistrationState = "submitted" | "approved" | "rejected" | "draft";

export interface RegistrationStatus {
  status: RegistrationState;
  submitted_at: string;
  /** True while awaiting review: the details can still be corrected. */
  editable: boolean;
  details?: {
    full_name: string;
    sex: "male" | "female";
    date_of_birth: string;
    region: string | null;
    zone: string | null;
    woreda: string | null;
    kebele: string | null;
    disability: boolean;
    education_level: string | null;
    marital_status: string | null;
    vulnerability_category: string | null;
  };
}

const BASE = "/public/participants";

export const getRegistrationOptions = () => api.anon.get<RegistrationOptions>(`${BASE}/options`);

/** `test_code` only where no SMS gateway exists (development). */
export const sendPhoneCode = (phone: string) =>
  api.anon.post<{ sent: true; test_code?: string }>(`${BASE}/phone-code`, { phone });

export const verifyPhoneCode = (phone: string, code: string) =>
  api.anon.post<{ verification_token: string }>(`${BASE}/phone-code/verify`, { phone, code });

/** Returns the private status token: kept on the phone so she can check later. */
export const submitRegistration = (data: RegistrationInput) =>
  api.anon.post<{ received: true; status_token: string }>(`${BASE}/register`, data);

export const getRegistrationStatus = (token: string) =>
  api.anon.get<RegistrationStatus>(`${BASE}/status/${token}`);

export const updateRegistration = (
  token: string,
  data: Partial<
    {
      full_name: string;
      sex: "male" | "female";
      date_of_birth: string;
      zone: string;
      woreda: string;
      kebele: string;
      disability: boolean;
    } & RegistrationAnswers
  >,
) => api.anon.patch<{ success: true }>(`${BASE}/status/${token}`, data);

/* The private status token, kept in the device keystore. */
const STATUS_KEY = "meal-mis.registration-status";

export const savedRegistration = {
  get: () => secureStorage.get(STATUS_KEY),
  set: (token: string) => secureStorage.set(STATUS_KEY, token),
  clear: () => secureStorage.remove(STATUS_KEY),
};

/* Zone and woreda on the public form, from Reference data (the same lists the officer form uses). */

type Places = Pick<RegistrationOptions, "zones" | "woredas"> | undefined;

const toOptions = (rows: ListOption[]) => rows.map((r) => ({ label: r.label, value: r.code }));

/** The zones listed under a region. None listed: the zone is typed. */
export const zonesOf = (places: Places, region: string) =>
  toOptions((places?.zones ?? []).filter((z) => z.parent === region));

/** The woredas listed under a zone (the list is partial). */
export const woredasOf = (places: Places, zone: string) =>
  toOptions((places?.woredas ?? []).filter((w) => w.parent === zone));

/**
 * A stored or ID-service woreda as the two form fields: the listed code when
 * it is listed under the zone, otherwise "Other" plus the typed name.
 */
export function splitWoreda(places: Places, zone: string, value: string) {
  if (!value) return { woreda: "", woredaOther: "" };
  const listed = woredasOf(places, zone).some((w) => w.value === value);
  return listed ? { woreda: value, woredaOther: "" } : { woreda: OTHER, woredaOther: value };
}

/** What is sent for the woreda: the listed code, or the typed name (Other, or no woredas listed for the zone). */
export function chosenWoreda(places: Places, zone: string, woreda: string, woredaOther: string) {
  const typed = woredasOf(places, zone).length === 0 || woreda === OTHER;
  return (typed ? woredaOther : woreda).trim();
}
