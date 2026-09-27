import { api } from "./api";
import { cachedFetch } from "./offline-cache";
import { fetchLookups, fetchSettings } from "./reference";
import type {
  EnterpriseRow,
  IndicatorRow,
  ParticipantRow,
  SurveyQuestionRow,
  SurveyResponseRow,
  SurveyTemplateRow,
  TrainingEventRow,
} from "./types";

/* ------------------------------- dashboard ------------------------------- */

export interface DashboardStats {
  participants: number;
  activeParticipants: number;
  female: number;
  youth: number;
  disability: number;
  enterprises: number;
  trainingEvents: number;
  surveyResponses: number;
  indicators: number;
  onTrack: number;
  atRisk: number;
  /** Open work items the API also reports; used by the header's notifications sheet. */
  openFeedback?: number;
  openSafeguarding?: number;
  openActions?: number;
  topRegions: { region: string; count: number }[];
  registrationTrend: { month: string; count: number }[];
}

export const getDashboardStats = () => api.get<DashboardStats>("/dashboard/stats");

/* ------------------------------ participants ----------------------------- */

/**
 * Mirrors the backend's participantSchema (participants.schemas.ts). The API
 * requires full_name, date_of_birth, sex, woreda and phone, plus at least one of
 * national_id / kebele_id; participant_id is generated server-side when omitted.
 */
export interface ParticipantInput {
  participant_id?: string;
  full_name: string;
  /** Exactly 12 characters when given. */
  national_id?: string;
  kebele_id?: string;
  /** YYYY-MM-DD, not in the future. */
  date_of_birth: string;
  sex: "male" | "female";
  /** Region, zone and woreda are all required by the API on registration. */
  region: string;
  zone: string;
  woreda: string;
  kebele?: string;
  /** +251 or 0, then 7 or 9, then 8 digits. */
  phone: string;
  email?: string;
  disability?: boolean;
  disability_type?: string;
  education_level?: string;
  marital_status?: string;
  family_size?: number;
  vulnerability_category?: string;
  /** The API accepts only these two on create. */
  status?: "active" | "inactive";
  /** Must be true: the API refuses a registration without informed consent. */
  consent_given: boolean;
  consent_version?: string;
  notes?: string;
  /** Made on the device, so a replayed offline registration is not saved twice. */
  client_ref?: string;
}

export interface DuplicateCheck {
  national_id?: string;
  kebele_id?: string;
  phone?: string;
  full_name?: string;
  date_of_birth?: string;
}

export const checkParticipantDuplicate = (input: DuplicateCheck) =>
  api.post<{ isDuplicate: boolean; match?: { id: string; participant_id: string; full_name: string } | null }>(
    "/participants/check-duplicate",
    input,
  );

/** What the national ID register (Fayida) returns for auto-fill. */
export interface FayidaDemographics {
  full_name?: string;
  date_of_birth?: string;
  sex?: "male" | "female";
  region?: string;
  zone?: string;
  woreda?: string;
  kebele?: string;
  phone?: string;
}

/** Fayida e-KYC, step 1: an OTP goes to the phone registered with the National ID. */
export const sendFayidaOtp = (national_id: string) =>
  api.post<{ sent: boolean; message?: string }>("/participants/verify-fayida/send-otp", { national_id });

/** Step 2: the participant reads the code back; a match returns their demographics. */
export const verifyFayidaOtp = (national_id: string, otp: string) =>
  api.post<{ valid: boolean; source?: "fayida" | "mock"; data?: FayidaDemographics; message?: string }>(
    "/participants/verify-fayida/verify-otp",
    { national_id, otp },
  );

export const listParticipants = () => api.get<ParticipantRow[]>("/participants");

export const getParticipantDetail = (id: string) =>
  api.get<{
    participant: ParticipantRow;
    enterprise: Pick<EnterpriseRow, "id" | "enterprise_name" | "enterprise_type" | "status"> | null;
    trainings: {
      id: string;
      attendance_date: string;
      status: string;
      training_events: Pick<TrainingEventRow, "id" | "title" | "start_date"> | null;
    }[];
  }>(`/participants/${id}/detail`);

export const createParticipant = (input: ParticipantInput) => api.post<ParticipantRow>("/participants", input);

/* -------------------------------- surveys -------------------------------- */

type SurveyListItem = SurveyTemplateRow & { response_count: number; question_count: number };

/** The surveys list, kept on the device so it can be opened offline. */
export const listSurveys = () =>
  cachedFetch("surveys", () => api.get<SurveyListItem[]>("/surveys"));

/**
 * A survey form for data collection. Only the template and its questions are
 * kept on the device — never the responses already collected, which hold
 * other people's personal data.
 */
export const getSurvey = (id: string) =>
  cachedFetch(`survey:${id}`, async () => {
    const full = await api.get<{
      template: SurveyTemplateRow;
      questions: SurveyQuestionRow[];
      responses: SurveyResponseRow[];
    }>(`/surveys/${id}`);
    return { template: full.template, questions: full.questions };
  });

/**
 * Download everything a field officer needs to work without a connection:
 * reference lists, programme settings and the form of every active survey. Returns how many
 * survey forms were stored.
 */
export async function downloadForOffline(): Promise<{ surveys: number }> {
  await fetchLookups();
  await fetchSettings();
  const surveys = await listSurveys();
  const active = surveys.filter((s) => s.status === "active");
  for (const s of active) await getSurvey(s.id);
  return { surveys: active.length };
}

export interface SurveyResponseInput {
  template_id: string;
  /** Device-made, so a replayed offline submission is not saved twice. */
  client_ref?: string;
  respondent_name?: string;
  respondent_sex: "male" | "female";
  is_youth?: boolean;
  disability?: boolean;
  region: string;
  zone?: string;
  woreda?: string;
  collected_on: string;
  enumerator?: string;
  status: "draft" | "submitted";
  notes?: string;
  answers: {
    question_id: string;
    value_text?: string;
    value_number?: number;
    value_options?: string[];
  }[];
}

export const submitSurveyResponse = (input: SurveyResponseInput) =>
  api.post<SurveyResponseRow>("/surveys/responses", input);

/* ------------------------------- monitoring ------------------------------- */

export const listIndicators = () =>
  api.get<(IndicatorRow & { actual_total: number; latest_period: string | null })[]>("/monitoring/indicators");

/* -------------------------------- training -------------------------------- */

export const listTrainingEvents = () => api.get<TrainingEventRow[]>("/training/events");
