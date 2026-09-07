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
  topRegions: { region: string; count: number }[];
  registrationTrend: { month: string; count: number }[];
}

export const getDashboardStats = () => api.get<DashboardStats>("/dashboard/stats");

/* ------------------------------ participants ----------------------------- */

export interface ParticipantInput {
  participant_id: string;
  full_name: string;
  date_of_birth?: string;
  sex?: "male" | "female";
  region?: string;
  zone?: string;
  woreda?: string;
  kebele?: string;
  phone?: string;
  disability?: boolean;
  disability_type?: string;
  status?: "active" | "graduated" | "dropped" | "inactive";
  consent_given?: boolean;
  consent_version?: string;
  notes?: string;
}

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
