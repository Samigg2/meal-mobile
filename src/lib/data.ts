import { api, ApiError } from "./api";
import { cachedFetch, cachedFetchStamped } from "./offline-cache";
import { listCopy } from "./offline-lists";
import { fetchLookups, fetchSettings } from "./reference";
import type { PermissionModule } from "./permissions";
import type { PillTone } from "@/theme";
import type {
  EmploymentPlacementRow,
  EnterprisePerformanceRow,
  EnterpriseRow,
  FeedbackRow,
  LoanApplicationRow,
  FinancialServiceProviderRow,
  SurveyAnswerRow,
  IndicatorRow,
  ParticipantRow,
  SafeguardingCaseRow,
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
  /** Jobs and loans, for the Overview tiles that open their lists. */
  placements?: number;
  placementsVerified?: number;
  loans?: number;
  loansDisbursed?: number;
  topRegions: { region: string; count: number }[];
  registrationTrend: { month: string; count: number }[];
  /** Set only when the phone is offline: when these numbers were last saved. */
  savedAt?: string;
}

/** The last answer is kept on the phone, so the Overview still opens with no connection. */
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const { data, savedAt } = await cachedFetchStamped("dashboard-stats", () => api.get<DashboardStats>("/dashboard/stats"));
  return savedAt ? { ...data, savedAt } : data;
};

/* ----------------------------- notifications ----------------------------- */

export interface NotificationItem {
  id: string;
  title: string;
  subtitle: string;
  created_at: string;
  /** A path of the web app, e.g. "/participants/<id>". */
  href: string;
  /** Opened since the record last changed: no longer counted. */
  seen: boolean;
}
export interface NotificationGroup {
  key: string;
  label: string;
  count: number;
  unseen: number;
  items: NotificationItem[];
}
export interface Notifications {
  /** Not yet seen, across every queue: the bell's number. */
  total: number;
  all: number;
  groups: NotificationGroup[];
}

/** What is waiting for this person, decided by the server from their access. */
export const getNotifications = () =>
  cachedFetch("notifications", () => api.get<Notifications>("/notifications"), { secret: true });

/** Opening an item: it stops counting until its record changes. */
export const markNotificationSeen = (queue_key: string, record_id: string) =>
  api.post<{ success: boolean }>("/notifications/seen", { queue_key, record_id });

/* ------------------------------- registers ------------------------------- */

/** One page of a register, as the server's `/…/page` endpoints answer. */
export type Page<T> = {
  rows: T[];
  hasMore: boolean;
  total: number | null;
  limit: number;
  offset: number;
};
type PageQuery = {
  q?: string;
  limit?: number;
  offset?: number;
  withTotal?: boolean;
  /** A list's filter chip (review_status, status, …), as the server's page query names it. */
  [filter: string]: string | number | boolean | undefined;
};

export const listEnterprisesPage = (q: PageQuery) => api.get<Page<EnterpriseRow>>("/enterprises/page", q);

/** Complete offline copies of the registers (lib/offline-lists.ts): only the fields the lists show. */
export const enterprisesCopy = listCopy<EnterpriseRow>("enterprises", listEnterprisesPage, (e) => ({
  id: e.id,
  enterprise_name: e.enterprise_name,
  owner_participant_id: e.owner_participant_id,
  owner_name: e.owner_name,
  enterprise_type: e.enterprise_type,
  status: e.status,
  region: e.region,
  woreda: e.woreda,
  review_status: e.review_status,
  created_at: e.created_at,
}) as EnterpriseRow);

/** One enterprise; kept encrypted once opened, so it opens again with no connection. */
export const getEnterprise = (id: string) =>
  cachedFetch(`enterprise:${id}`, () => api.get<EnterpriseRow>(`/enterprises/${id}`), { secret: true });

export type PerformanceVisit = EnterprisePerformanceRow & {
  verified_by_name: string | null;
  created_by_name: string | null;
};

/** An enterprise's visits (performance records), newest first, as the web's Performance panel shows them. */
export const getEnterprisePerformance = (id: string) =>
  cachedFetch(
    `enterprise-performance:${id}`,
    async () => {
      const r = await api.get<{ records: PerformanceVisit[] }>(`/enterprises/${id}/performance`);
      return [...r.records].sort((a, b) => (a.period_end < b.period_end ? 1 : -1));
    },
    { secret: true },
  );

export type PlacementListRow = EmploymentPlacementRow & {
  participant_name: string;
};
export const listPlacementsPage = (q: PageQuery) => api.get<Page<PlacementListRow>>("/employment/placements/page", q);
export const placementsCopy = listCopy<PlacementListRow>("placements", listPlacementsPage, (j) => ({
  id: j.id,
  participant_id: j.participant_id,
  participant_name: j.participant_name,
  job_title: j.job_title,
  employer_name: j.employer_name,
  placement_type: j.placement_type,
  start_date: j.start_date,
  verified_on: j.verified_on,
  status: j.status,
}) as PlacementListRow);

export type LoanListRow = LoanApplicationRow & {
  borrower: string;
  provider_name: string | null;
  outstanding: number;
  enterprises: {
    enterprise_name: string;
    owner_participant_id: string | null;
  } | null;
};
export const listLoansPage = (q: PageQuery) => api.get<Page<LoanListRow>>("/finance/loans/page", q);
export const loansCopy = listCopy<LoanListRow>("loans", listLoansPage, (l) => ({
  id: l.id,
  participant_id: l.participant_id,
  borrower: l.borrower,
  provider_name: l.provider_name,
  enterprises: l.enterprises,
  product_type: l.product_type,
  amount_approved: l.amount_approved,
  amount_requested: l.amount_requested,
  currency: l.currency,
  application_date: l.application_date,
  status: l.status,
}) as LoanListRow);

/** Newest-first pages for the Home tabs (no copy kept offline). */
export const listFeedbackPage = (q: PageQuery) => api.get<Page<FeedbackRow>>("/feedback/page", q);
export const listConcernsPage = (q: PageQuery) =>
  api.get<Page<Pick<SafeguardingCaseRow, "id" | "case_type" | "status" | "reported_date" | "created_at">>>("/safeguarding/page", q);
/** One feedback entry; kept encrypted once opened, so it opens again with no connection. */
export const getFeedback = (id: string) =>
  cachedFetch(`feedback:${id}`, () => api.get<FeedbackRow>(`/records/feedback/${id}`), { secret: true });
/** One concern, always read from the server: a safeguarding case is not kept on the phone. */
export const getConcern = (id: string) => api.get<SafeguardingCaseRow>(`/records/safeguarding/${id}`);
export const listTrainingPage = (q: PageQuery) => api.get<Page<TrainingEventRow>>("/training/events/page", q);

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
  api.post<{
    isDuplicate: boolean;
    match?: { id: string; participant_id: string; full_name: string } | null;
  }>("/participants/check-duplicate", input);

export type ParticipantFilters = {
  /** Matches the name, participant ID or phone. */
  q?: string;
  status?: "active" | "inactive";
  sex?: "male" | "female";
  is_youth?: "yes" | "no";
  disability?: "yes" | "no";
  consent?: "yes" | "no";
};

export type ParticipantPage = {
  rows: ParticipantRow[];
  hasMore: boolean;
  /** Only when asked for with `withTotal`. */
  total: number | null;
  limit: number;
  offset: number;
};

/**
 * One page of participants, searched and filtered by the server. The whole
 * register is never downloaded: at programme scale that is megabytes over a
 * phone connection.
 */
export const listParticipantsPage = (
  q: ParticipantFilters & {
    limit?: number;
    offset?: number;
    withTotal?: boolean;
  } = {},
) => api.get<ParticipantPage>("/participants/page", q);

export const participantsCopy = listCopy<ParticipantRow>("participants", (q) => listParticipantsPage(q), (p) => ({
  id: p.id,
  participant_id: p.participant_id,
  full_name: p.full_name,
  sex: p.sex,
  phone: p.phone,
  region: p.region,
  zone: p.zone,
  woreda: p.woreda,
  kebele: p.kebele,
  date_of_birth: p.date_of_birth,
  education_level: p.education_level,
  review_status: p.review_status,
  created_at: p.created_at,
  status: p.status,
  consent_given: p.consent_given,
  is_youth: p.is_youth,
  disability: p.disability,
}) as ParticipantRow);

/** The newest rows of a register for Home; offline, the first of its saved copy (servers list newest first). */
export async function newestOf<T>(
  fetch: (q: { limit: number; offset: number }) => Promise<{ rows: T[] }>,
  copy?: { read: () => Promise<{ data: { rows: T[] } } | null> },
  limit = 8,
): Promise<T[]> {
  try {
    return (await fetch({ limit, offset: 0 })).rows;
  } catch (error) {
    if (copy && error instanceof ApiError && error.isNetworkError) {
      const saved = await copy.read();
      if (saved) return saved.data.rows.slice(0, limit);
    }
    throw error;
  }
}

/**
 * One participant with their enterprise, jobs and loans. Kept on the phone
 * once opened, encrypted and wiped on sign-out, so a person visited earlier
 * can still get an enterprise, loan or job recorded with no connection. A
 * person never opened is built from the saved registers (`fromCopy`): the same
 * name, enterprise, jobs and loans, without training history.
 */
export async function getParticipantDetail(id: string): Promise<ParticipantDetail> {
  try {
    return await cachedFetch(`participant:${id}`, () => fetchParticipantDetail(id), { secret: true });
  } catch (error) {
    if (error instanceof ApiError && error.isNetworkError) {
      const built = await detailFromCopies(id);
      if (built) return built;
    }
    throw error;
  }
}

export type ParticipantDetail = Awaited<ReturnType<typeof fetchParticipantDetail>> & {
  /** Built from the saved registers, not the person's own page. */
  fromCopy?: boolean;
};

async function detailFromCopies(id: string): Promise<ParticipantDetail | null> {
  const [people, enterprises, jobs, loans] = await Promise.all([
    participantsCopy.read(),
    enterprisesCopy.read(),
    placementsCopy.read(),
    loansCopy.read(),
  ]);
  const participant = people?.data.rows.find((p) => p.id === id);
  if (!participant) return null;
  const enterprise = enterprises?.data.rows.find((e) => e.owner_participant_id === id);
  return {
    participant,
    enterprise: enterprise
      ? {
          id: enterprise.id,
          enterprise_name: enterprise.enterprise_name,
          enterprise_type: enterprise.enterprise_type,
          status: enterprise.status,
        }
      : null,
    trainings: [],
    employment: (jobs?.data.rows ?? [])
      .filter((j) => j.participant_id === id)
      .map((j) => ({
        id: j.id,
        placement_type: j.placement_type,
        employer_name: j.employer_name,
        job_title: j.job_title,
        start_date: j.start_date,
        status: j.status,
        verified_on: j.verified_on,
      })),
    loans: (loans?.data.rows ?? [])
      .filter((l) => l.participant_id === id)
      .map((l) => ({
        id: l.id,
        product_type: l.product_type ?? "loan",
        amount_requested: l.amount_requested,
        currency: l.currency,
        status: l.status,
        application_date: l.application_date,
        financial_service_providers: l.provider_name ? { name: l.provider_name } : null,
      })),
    fromCopy: true,
  };
}

const fetchParticipantDetail = (id: string) =>
  api.get<{
    participant: ParticipantRow;
    enterprise: Pick<EnterpriseRow, "id" | "enterprise_name" | "enterprise_type" | "status"> | null;
    trainings: {
      id: string;
      attendance_date: string;
      status: string;
      training_events: Pick<TrainingEventRow, "id" | "title" | "start_date"> | null;
    }[];
    /** Only with employment read. */
    employment: {
      id: string;
      placement_type: string;
      employer_name: string | null;
      job_title: string | null;
      start_date: string | null;
      status: string;
      /** Set once someone confirmed the job; follow-ups need it. */
      verified_on: string | null;
    }[];
    /** Only with finance read. */
    loans: {
      id: string;
      product_type: string;
      amount_requested: number;
      currency: string;
      status: string;
      application_date: string;
      financial_service_providers: { name: string } | null;
    }[];
  }>(`/participants/${id}/detail`);

/** `fayida_token`: the one-time proof from a Fayida check made just before (lib/fayida.ts). */
export const createParticipant = (input: ParticipantInput & { fayida_token?: string }) =>
  api.post<ParticipantRow>("/participants", input);

/** Same validation and duplicate-across-organizations check as create, run again on the changed fields. */
export const updateParticipant = (id: string, participant: Partial<ParticipantInput>) =>
  api.patch<ParticipantRow>(`/participants/${id}`, { participant });

/* -------------------------------- surveys -------------------------------- */

type SurveyListItem = SurveyTemplateRow & {
  response_count: number;
  question_count: number;
  /** The evaluation this survey collects data for, when it is linked to one (0089). */
  evaluation_title?: string | null;
};

/** The surveys list, kept on the device so it can be opened offline. */
export const listSurveys = () => cachedFetch("surveys", () => api.get<SurveyListItem[]>("/surveys"));

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
 * reference lists, programme settings, the form of every active survey, and
 * what the field forms the officer may fill need: trainings around today with
 * their rosters, lenders, the work plan. Returns how many survey forms and
 * trainings were stored.
 */
export async function downloadForOffline(
  can: (module: PermissionModule, action?: "read" | "write") => boolean,
): Promise<{
  surveys: number;
  trainings: number;
}> {
  await fetchLookups();
  await fetchSettings();
  let active: SurveyListItem[] = [];
  if (can("surveys")) {
    active = (await listSurveys()).filter((s) => s.status === "active");
    for (const s of active) await getSurvey(s.id);
  }
  let trainings: TrainingEventRow[] = [];
  if (can("training", "write")) {
    trainings = nearToday(await listTrainingEvents());
    for (const t of trainings) await getTrainingDetail(t.id);
  }
  if (can("finance", "write")) await listProviders();
  if (can("monitoring", "write")) await listActivities();
  // The complete registers of the person's organization, for lists and search with no connection.
  if (can("participants")) await participantsCopy.download();
  if (can("enterprises")) await enterprisesCopy.download();
  if (can("employment")) await placementsCopy.download();
  if (can("finance")) await loansCopy.download();
  return { surveys: active.length, trainings: trainings.length };
}

export interface SurveyResponseInput {
  template_id: string;
  /** Device-made, so a replayed offline submission is not saved twice. */
  client_ref?: string;
  respondent_name?: string;
  respondent_sex: "male" | "female";
  /** A code from the admin list survey_responses.age_group. */
  age_group?: string;
  is_youth?: boolean;
  disability?: boolean;
  region: string;
  zone?: string;
  woreda?: string;
  kebele?: string;
  /** The day the answers were collected, YYYY-MM-DD: kept when the response uploads later. */
  collected_on: string;
  enumerator?: string;
  status: "draft" | "submitted";
  notes?: string;
  latitude?: number;
  longitude?: number;
  gps_accuracy_m?: number;
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
  cachedFetch("indicators", () =>
    api.get<(IndicatorRow & { actual_total: number; latest_period: string | null })[]>("/monitoring/indicators"),
  );

/* -------------------------------- training -------------------------------- */

export const listTrainingEvents = () =>
  cachedFetch("training-events", () => api.get<TrainingEventRow[]>("/training/events"));

export interface RosterEntry {
  participant_id: string;
  participants: {
    id: string;
    full_name: string;
    participant_id: string;
    sex: string | null;
  } | null;
}

export interface TrainingDetail {
  event: TrainingEventRow;
  attendance: { id: string; attendance_date: string; participant_id: string }[];
  roster: RosterEntry[];
}

/** A session with its roster: kept on the phone, encrypted (names), for taking attendance offline. */
export const getTrainingDetail = (id: string) =>
  cachedFetch(
    `training:${id}`,
    async (): Promise<TrainingDetail> => {
      const full = await api.get<TrainingDetail>(`/training/events/${id}/detail`);
      // Only what the attendance screen needs: no phones, scores or certificates.
      return {
        event: full.event,
        attendance: full.attendance.map((a) => ({
          id: a.id,
          attendance_date: a.attendance_date,
          participant_id: a.participant_id,
        })),
        roster: full.roster.map((r) => ({
          participant_id: r.participant_id,
          participants: r.participants,
        })),
      };
    },
    { secret: true },
  );

/** Sessions running at any point from two weeks ago to two weeks ahead: the ones kept for offline. */
const TRAINING_WINDOW_DAYS = 14;
export function nearToday(events: TrainingEventRow[]): TrainingEventRow[] {
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const from = day(-TRAINING_WINDOW_DAYS);
  const to = day(TRAINING_WINDOW_DAYS);
  return events.filter((t) => !!t.start_date && t.start_date <= to && (t.end_date ?? t.start_date) >= from);
}

export interface AttendanceInput {
  training_event_id: string;
  attendance_date: string;
  /** Present: added for this day if not already recorded. */
  participant_ids: string[];
  /** Unticked: taken off this day. */
  absent_ids: string[];
}

/* ------------------------- safeguarding & feedback ------------------------ */

export const SAFEGUARDING_TYPES = [
  { label: "Sexual exploitation", value: "sexual_exploitation" },
  { label: "Abuse", value: "abuse" },
  { label: "Harassment", value: "harassment" },
  { label: "Discrimination", value: "discrimination" },
  { label: "Child safeguarding", value: "child_safeguarding" },
  { label: "Fraud", value: "fraud" },
  { label: "Other", value: "other" },
] as const;
export type SafeguardingType = (typeof SAFEGUARDING_TYPES)[number]["value"];

export interface SafeguardingInput {
  case_type: SafeguardingType;
  reported_date: string;
  incident_date?: string;
  description?: string;
  confidential_notes?: string;
  client_ref: string;
}

export const FEEDBACK_TYPES = [
  { label: "Complaint", value: "complaint" },
  { label: "Suggestion", value: "suggestion" },
  { label: "Compliment", value: "compliment" },
  { label: "Query", value: "query" },
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number]["value"];

export interface FeedbackInput {
  feedback_type: FeedbackType;
  source: string;
  description: string;
  received_date: string;
  category?: string;
  priority: string;
  reporter_name?: string;
  reporter_sex?: string;
  reporter_age?: number;
  reporter_contact?: string;
  response_wanted: boolean;
  referred_to?: string;
  region?: string;
  zone?: string;
  woreda?: string;
  kebele?: string;
  client_ref: string;
}

/* ------------------------------ enterprises ------------------------------ */

export interface EnterpriseInput {
  enterprise_name: string;
  owner_participant_id: string;
  enterprise_type: string;
  region: string;
  zone: string;
  woreda: string;
  kebele?: string;
  phone: string;
  email?: string;
  status?: "active" | "inactive";
  registration_status: string;
  tin_number?: string;
  established_date: string;
  employees_male: number;
  employees_female: number;
  latitude?: number;
  longitude?: number;
  confirm_duplicate?: boolean;
  client_ref: string;
}

export interface PerformanceInput {
  period_start: string;
  period_end: string;
  revenue: number;
  profit?: number;
  employees_male: number;
  employees_female: number;
  youth_employees_male: number;
  youth_employees_female: number;
  employees_disability: number;
  markets_count: number;
  products_count: number;
  main_markets?: string;
  data_source: string;
  notes?: string;
  client_ref: string;
}

/* -------------------------------- finance -------------------------------- */

/** Lenders, kept on the phone so a loan can be recorded offline. */
export const listProviders = () =>
  cachedFetch("finance-providers", () => api.get<FinancialServiceProviderRow[]>("/finance/providers"));

export const LOAN_PRODUCTS = [
  { label: "Business loan", value: "business_loan" },
  { label: "Personal loan", value: "personal_loan" },
] as const;
export type LoanProduct = (typeof LOAN_PRODUCTS)[number]["value"];

export interface LoanInput {
  provider_id: string;
  /** The borrower: a participant or an approved enterprise, never both (12Beforeend). */
  participant_id?: string;
  enterprise_id?: string;
  product_type: LoanProduct;
  amount_requested: number;
  term_months?: number;
  purpose?: string;
  application_date: string;
  notes?: string;
  client_ref: string;
}

export interface RepaymentInput {
  application_id: string;
  amount: number;
  date: string;
  channel: string;
  reference: string;
  notes?: string;
  client_ref: string;
}

/** Loans a repayment can be recorded against (the server's REPAYABLE_STATUSES). */
export const REPAYABLE = new Set(["disbursed", "repaying"]);

/* ------------------------------- employment ------------------------------ */

export const PLACEMENT_TYPES = [
  { label: "Wage job", value: "wage_employment" },
  { label: "Internship", value: "internship" },
  { label: "Contract", value: "contract" },
] as const;
export type PlacementType = (typeof PLACEMENT_TYPES)[number]["value"];

export interface PlacementInput {
  participant_id: string;
  placement_type: PlacementType;
  employer_name?: string;
  job_title?: string;
  sector?: string;
  region?: string;
  zone?: string;
  woreda?: string;
  kebele?: string;
  start_date: string;
  end_date?: string;
  monthly_income?: number;
  notes?: string;
  confirm_duplicate?: boolean;
  client_ref: string;
}

export interface FollowUpInput {
  round_months: number;
  follow_up_date: string;
  outcome: string;
  monthly_income?: number;
  job_ended_on?: string;
  exit_reason?: string;
  contact_method: string;
  notes?: string;
  client_ref: string;
}

/* ------------------------------- activities ------------------------------ */

export type ActivityStatus = "not_started" | "in_progress" | "completed" | "cancelled";

export interface ActivityRow {
  id: string;
  title: string;
  description: string | null;
  status: ActivityStatus;
  progress_percent: number;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  is_delayed: boolean;
  completion_review: string | null;
  indicators: { code: string; name: string } | null;
}

export const ACTIVITY_STATUS: Record<ActivityStatus, { label: string; tone: PillTone }> = {
  not_started: { label: "Not started", tone: "grey" },
  in_progress: { label: "In progress", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
  cancelled: { label: "Cancelled", tone: "grey" },
};

/** The work plan, kept on the phone so progress can be updated offline. */
export const listActivities = () => cachedFetch("activities", () => api.get<ActivityRow[]>("/monitoring/activities"));

export interface ProgressInput {
  progress_percent: number;
  status: ActivityStatus;
  actual_start?: string;
  actual_end?: string;
}

/* ----------------------------- my responses ------------------------------ */

export type MyResponse = SurveyResponseRow & { answers: SurveyAnswerRow[] };

/** The responses to a survey this officer collected, with their answers: online only, never kept on the phone. */
export async function listMyResponses(templateId: string, userId: string): Promise<MyResponse[]> {
  const full = await api.get<{
    responses: SurveyResponseRow[];
    answers: SurveyAnswerRow[];
  }>(`/surveys/${templateId}`);
  return full.responses
    .filter((r) => r.created_by === userId)
    .map((r) => ({
      ...r,
      answers: full.answers.filter((a) => a.response_id === r.id),
    }));
}

/** The collector's correction, while it waits or after a rejection (the server refuses a verified one). */
export const updateSurveyResponse = (id: string, input: SurveyResponseInput) =>
  api.patch<SurveyResponseRow>(`/surveys/responses/${id}`, input);

/** One record by its generic route (the flat row), to fill a form that changes it. */
export const getRecord = <T extends object>(spec: string, id: string) => api.get<T>(`/records/${spec}/${id}`);
