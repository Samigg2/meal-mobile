import { api } from "./api";
import { secureStorage } from "./storage";

/**
 * A young person registering herself, with no account. The same public API
 * as the web form (meal-mis-frontend/src/routes/register.tsx): she proves her
 * phone number with an SMS code, may check her National ID with the ID
 * service, and the registration waits for a programme officer's review. It
 * counts in nothing until approved.
 */

export interface RegistrationOptions {
  /** Which proofs the API can ask for. Without phone, registration is closed. */
  verification: { phone: boolean; fayida: boolean };
  regions: { code: string; label: string }[];
  /** A region covered by several clusters asks the person which one is hers. */
  clusters: { id: string; name: string; region: string }[];
}

export interface RegistrationInput {
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
    zone: string | null;
    woreda: string | null;
    kebele: string | null;
    disability: boolean;
  };
}

const BASE = "/public/participants";

export const getRegistrationOptions = () => api.anon.get<RegistrationOptions>(`${BASE}/options`);

/** `test_code` only where no SMS gateway exists (development). */
export const sendPhoneCode = (phone: string) =>
  api.anon.post<{ sent: true; test_code?: string }>(`${BASE}/phone-code`, { phone });

export const verifyPhoneCode = (phone: string, code: string) =>
  api.anon.post<{ verification_token: string }>(`${BASE}/phone-code/verify`, { phone, code });

export const sendIdCode = (nationalId: string) =>
  api.anon.post<{ sent: boolean; message?: string }>(`${BASE}/fayida/send-code`, { national_id: nationalId });

/** `source` is "mock" while the ID service is a test stub. */
export const verifyIdCode = (nationalId: string, otp: string) =>
  api.anon.post<{ fayida_token: string; source: "fayida" | "mock"; data: IdDetails }>(
    `${BASE}/fayida/verify-code`,
    { national_id: nationalId, otp },
  );

/** Returns the private status token: kept on the phone so she can check later. */
export const submitRegistration = (data: RegistrationInput) =>
  api.anon.post<{ received: true; status_token: string }>(`${BASE}/register`, data);

export const getRegistrationStatus = (token: string) =>
  api.anon.get<RegistrationStatus>(`${BASE}/status/${token}`);

export const updateRegistration = (
  token: string,
  data: Partial<{
    full_name: string;
    sex: "male" | "female";
    date_of_birth: string;
    zone: string;
    woreda: string;
    kebele: string;
    disability: boolean;
  }>,
) => api.anon.patch<{ success: true }>(`${BASE}/status/${token}`, data);

/* The private status token, kept in the device keystore. */
const STATUS_KEY = "meal-mis.registration-status";

export const savedRegistration = {
  get: () => secureStorage.get(STATUS_KEY),
  set: (token: string) => secureStorage.set(STATUS_KEY, token),
  clear: () => secureStorage.remove(STATUS_KEY),
};
