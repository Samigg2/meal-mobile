import { api } from "./api";
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
  region?: string;
  zone?: string;
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
  consent_given?: boolean;
  consent_version?: string;
  notes?: string;
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

export const listParticipants = () => api.get<ParticipantRow[]>("/participants");

export const getParticipantDetail = (id: string) =>
  api.get<{
    participant: ParticipantRow;
    enterprise: Pick<EnterpriseRow, "id" | "enterprise_name" | "enterprise_type" | "sector" | "status"> | null;
    trainings: {
      id: string;
      attendance_date: string;
      status: string;
      training_events: Pick<TrainingEventRow, "id" | "title" | "start_date"> | null;
    }[];
  }>(`/participants/${id}/detail`);

export const createParticipant = (input: ParticipantInput) => api.post<ParticipantRow>("/participants", input);

/* -------------------------------- surveys -------------------------------- */

export const listSurveys = () =>
  api.get<(SurveyTemplateRow & { response_count: number; question_count: number })[]>("/surveys");

export const getSurvey = (id: string) =>
  api.get<{
    template: SurveyTemplateRow;
    questions: SurveyQuestionRow[];
    responses: SurveyResponseRow[];
  }>(`/surveys/${id}`);

export interface SurveyResponseInput {
  template_id: string;
  respondent_name?: string;
  respondent_sex?: "male" | "female";
  is_youth?: boolean;
  disability?: boolean;
  region?: string;
  zone?: string;
  woreda?: string;
  collected_on: string;
  enumerator?: string;
  status: "draft" | "submitted" | "validated" | "rejected";
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
