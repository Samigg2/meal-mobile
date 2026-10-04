/**
 * Row and enum types for the MEAL MIS API.
 *
 * Generated from the PostgreSQL schema owned by meal-mis-backend
 * (`npm run gen:types` in the backend repo). Do not edit by hand: change the
 * schema in a backend migration and regenerate.
 */

/* ------------------------------- enums ------------------------------- */

export type ActionPriority = "low" | "medium" | "high" | "critical";
export type ActionSource = "feedback" | "safeguarding" | "reflection_meeting" | "governance" | "evaluation" | "audit" | "monitoring" | "other" | "lesson_learned";
export type ActionStatus = "open" | "in_progress" | "blocked" | "completed" | "cancelled";
export type ActivityStatus = "not_started" | "in_progress" | "completed" | "delayed" | "cancelled";
export type AttendanceStatus = "present" | "absent" | "excused";
export type EmploymentStatus = "placed" | "retained" | "exited" | "verified" | "pending_verification";
export type EmploymentType = "wage_employment" | "self_employment" | "apprenticeship" | "internship" | "contract";
export type EnterpriseStatus = "active" | "inactive" | "graduated" | "dropped";
export type EnterpriseType = "trade" | "service" | "manufacturing" | "agriculture" | "technology" | "other";
export type FeedbackSource = "helpline" | "suggestion_box" | "meeting" | "survey" | "other";
export type FeedbackStatus = "new" | "in_review" | "resolved" | "closed";
export type FeedbackType = "complaint" | "suggestion" | "compliment" | "query";
export type FspType = "bank" | "microfinance" | "cooperative" | "saving_group" | "fintech" | "other";
export type GovernanceEngagementType = "stakeholder_meeting" | "policy_dialogue" | "advocacy_action" | "coordination_forum" | "consultation" | "other";
export type GovernanceStatus = "planned" | "held" | "cancelled" | "followed_up";
export type IndicatorFrequency = "monthly" | "quarterly" | "biannual" | "annual";
export type IndicatorLevel = "output" | "outcome" | "impact";
export type IndicatorStatus = "active" | "paused" | "retired";
export type LoanStatus = "applied" | "under_review" | "approved" | "rejected" | "disbursed" | "repaying" | "closed" | "defaulted";
export type ParticipantSex = "male" | "female";
export type ParticipantStatus = "active" | "graduated" | "dropped" | "inactive";
export type PartnerType = "government" | "ngo" | "private_sector" | "cso" | "media" | "other";
export type PartnershipStatus = "active" | "pending" | "completed" | "terminated";
export type SafeguardingCaseStatus = "open" | "investigating" | "closed" | "referred";
export type SafeguardingCaseType = "sexual_exploitation" | "abuse" | "harassment" | "discrimination" | "child_safeguarding" | "fraud" | "other";
export type SavingsStatus = "active" | "dormant" | "closed";
export type TrainingStatus = "planned" | "ongoing" | "completed" | "cancelled";
export type TrainingType = "technical" | "life_skills" | "business" | "financial_literacy" | "digital" | "other";

/* ------------------------------ aliases ------------------------------ */

/** A role key from public.roles. Was an enum until roles became data (migration 0047). */
export type AppRole = string;

/* -------------------------------- rows -------------------------------- */

export interface ActionItemRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  title: string;
  description: string | null;
  source: "feedback" | "safeguarding" | "reflection_meeting" | "governance" | "evaluation" | "audit" | "monitoring" | "other" | "lesson_learned";
  source_record_id: string | null;
  owner: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "blocked" | "completed" | "cancelled";
  progress_percent: number;
  completed_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  custom: Record<string, unknown>;
  owner_id: string | null;
}

export interface AppSettingRow {
  id: string;
  key: string;
  value: string;
  value_type: string;
  label: string;
  description: string | null;
  min_value: number | null;
  max_value: number | null;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
}

export interface AttachmentRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  module: string;
  record_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  organization_id: string | null;
}

export interface CustomFieldDefRow {
  id: string;
  organization_id: string;
  spec_key: string;
  name: string;
  label: string;
  type: string;
  lookup: string | null;
  options: Record<string, unknown> | null;
  required: boolean;
  sort_order: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmploymentPlacementRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  participant_id: string | null;
  placement_type: "wage_employment" | "self_employment" | "apprenticeship" | "internship" | "contract";
  employer_name: string | null;
  job_title: string | null;
  sector: string | null;
  region: string | null;
  start_date: string | null;
  end_date: string | null;
  monthly_income: number | null;
  currency: string;
  contract_type: string | null;
  status: "placed" | "retained" | "exited" | "verified" | "pending_verification";
  verified_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  zone: string | null;
  woreda: string | null;
  kebele: string | null;
  custom: Record<string, unknown>;
  verified_by: string | null;
}

export interface EmpowermentParticipantRow {
  id: string;
  organization_id: string | null;
  record_id: string;
  participant_id: string;
  created_at: string;
  created_by: string | null;
}

export interface EmpowermentRecordRow {
  id: string;
  organization_id: string | null;
  created_by: string | null;
  programme_area: string;
  activity_type: string;
  activity_date: string;
  facilitator: string | null;
  region: string | null;
  zone: string | null;
  woreda: string | null;
  outcome_description: string | null;
  change_observed: string | null;
  follow_up_required: boolean | null;
  follow_up_notes: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  participant_id: string | null;
  group_size: number;
  custom: Record<string, unknown>;
  enterprise_id: string | null;
  confidence_score_before: number | null;
  confidence_score_after: number | null;
  referral_pathway: string | null;
  is_safe_space_session: boolean;
  kebele: string | null;
  count_age_15_19: number | null;
  count_age_20_24: number | null;
  count_age_25_34: number | null;
  count_with_disability: number | null;
  linkage_type: string;
  network_name: string | null;
  facilitator_institution_id: string | null;
  outcome_tags: string[];
  change_tags: string[];
  network_id: string | null;
}

export interface EnterpriseRow {
  id: string;
  created_by: string;
  enterprise_name: string;
  owner_name: string | null;
  enterprise_type: string | null;
  region: string | null;
  zone: string | null;
  woreda: string | null;
  kebele: string | null;
  phone: string | null;
  email: string | null;
  registration_status: string | null;
  established_date: string | null;
  employees_male: number | null;
  employees_female: number | null;
  status: "active" | "inactive" | "graduated" | "dropped";
  created_at: string;
  updated_at: string;
  organization_id: string | null;
  owner_participant_id: string | null;
  annual_revenue: number | null;
  annual_profit: number | null;
  revenue_currency: string | null;
  last_revenue_date: string | null;
  employee_count: number | null;
  tin_number: string | null;
  latitude: number | null;
  longitude: number | null;
  custom: Record<string, unknown>;
}

export interface FeedbackRow {
  id: string;
  created_by: string | null;
  feedback_type: "complaint" | "suggestion" | "compliment" | "query";
  source: string;
  description: string;
  status: "new" | "in_review" | "resolved" | "closed";
  resolution: string | null;
  created_at: string;
  updated_at: string;
  organization_id: string | null;
  reporter_name: string | null;
  reporter_contact: string | null;
  is_public_submission: boolean;
  reference_code: string | null;
  custom: Record<string, unknown>;
  priority: string;
  feedback_provided_to_reporter: boolean;
  feedback_provided_date: string | null;
  reporter_unreachable: boolean;
  received_date: string;
  reporter_sex: string | null;
  reporter_age: number | null;
  location: string | null;
  response_wanted: boolean;
  category: string | null;
  referred_to: string | null;
  staff_responsible_id: string | null;
  date_closed: string | null;
}

export interface FinancialServiceProviderRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  name: string;
  provider_type: string;
  region: string | null;
  zone: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  woreda: string | null;
  kebele: string | null;
  custom: Record<string, unknown>;
  products_offered: string[];
  offers_youth_products: boolean;
  offers_women_products: boolean;
  other_provider_type: string | null;
}

export interface GovernanceAttendeeRow {
  id: string;
  organization_id: string | null;
  engagement_id: string;
  partner_id: string;
  representatives_count: number;
  created_at: string;
}

export interface GovernanceEngagementRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  title: string;
  engagement_type: "stakeholder_meeting" | "policy_dialogue" | "advocacy_action" | "coordination_forum" | "consultation" | "other";
  engagement_date: string;
  location: string | null;
  region: string | null;
  zone: string | null;
  policy_theme: string | null;
  influence_level: string;
  objectives: string | null;
  key_outcomes: string | null;
  commitments: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  participants_count: number;
  female_count: number;
  custom: Record<string, unknown>;
  institution_id: string | null;
  partner_id: string | null;
  woreda: string | null;
  kebele: string | null;
}

export interface IndicatorValueRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  indicator_id: string;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  region: string | null;
  zone: string | null;
  actual_value: number;
  value_male: number | null;
  value_female: number | null;
  value_youth: number | null;
  value_disability: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  status: string;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  calculated: boolean;
}

export interface IndicatorRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  code: string;
  name: string;
  description: string | null;
  level: string;
  unit: string;
  baseline_value: number;
  target_value: number;
  target_date: string | null;
  frequency: string;
  region: string | null;
  responsible: string | null;
  status: "active" | "paused" | "retired";
  created_at: string;
  updated_at: string;
  custom: Record<string, unknown>;
  framework_code: string | null;
  result_area: string | null;
  responsible_id: string | null;
  disaggregation: string[];
  calculation_source: string;
}

export interface InstitutionRow {
  id: string;
  organization_id: string | null;
  created_by: string;
  institution_name: string;
  institution_type: string;
  level: string;
  mandate: string | null;
  region: string | null;
  zone: string | null;
  woreda: string | null;
  kebele: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  capacity_level: string;
  capacity_support_provided: boolean;
  capacity_support_description: string | null;
  partner_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeResourceRow {
  id: string;
  organization_id: string | null;
  title: string;
  resource_type: string;
  summary: string | null;
  author: string | null;
  external_url: string | null;
  publication_date: string | null;
  tags: string[];
  visibility: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  custom: Record<string, unknown>;
}

export interface LearningAgendaItemRow {
  id: string;
  organization_id: string | null;
  question: string;
  rationale: string | null;
  theme: string;
  method: string | null;
  owner: string | null;
  status: string;
  progress_percent: number;
  due_date: string | null;
  findings: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  custom: Record<string, unknown>;
  owner_id: string | null;
  collaborators: string | null;
  schedule_years: string[];
  dissemination: string[];
  product_resource_id: string | null;
}

export interface LessonsLearnedRow {
  id: string;
  organization_id: string | null;
  title: string;
  category: string;
  source: string;
  context: string | null;
  lesson: string;
  recommendation: string | null;
  action_taken: string | null;
  status: string;
  priority: string;
  region: string | null;
  tags: string[];
  date_identified: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  custom: Record<string, unknown>;
  source_document: string | null;
  outcome_area: string | null;
  learning_topic: string | null;
  issues_raised: string | null;
  change_effected: string | null;
  responsible_id: string | null;
}

export interface LoanApplicationRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  provider_id: string | null;
  participant_id: string | null;
  enterprise_id: string | null;
  product_type: string;
  amount_requested: number;
  amount_approved: number | null;
  currency: string;
  interest_rate: number | null;
  term_months: number | null;
  purpose: string | null;
  application_date: string;
  decision_date: string | null;
  status: "applied" | "under_review" | "approved" | "rejected" | "disbursed" | "repaying" | "closed" | "defaulted";
  notes: string | null;
  created_at: string;
  updated_at: string;
  ysla_group_id: string | null;
}

export interface LoanDisbursementRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  application_id: string;
  amount: number;
  currency: string;
  disbursed_on: string;
  channel: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoanRepaymentRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  application_id: string;
  amount: number;
  currency: string;
  paid_on: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LookupValueRow {
  id: string;
  category: string;
  code: string;
  label: string;
  parent_id: string | null;
  sort_order: number;
  active: boolean;
  organization_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialSupportRow {
  id: string;
  organization_id: string | null;
  created_by: string | null;
  participant_id: string | null;
  enterprise_id: string | null;
  support_type: string;
  item_description: string;
  quantity: number;
  unit: string | null;
  unit_value: number | null;
  currency: string;
  distribution_date: string;
  condition: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  partner_id: string | null;
  other_support_type: string | null;
  is_returnable: boolean;
  status_date: string | null;
  other_unit: string | null;
  custom: Record<string, unknown>;
}

export interface OrganizationRow {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  region: string | null;
}

export interface ParticipantRow {
  id: string;
  created_by: string;
  participant_id: string;
  full_name: string;
  national_id: string | null;
  date_of_birth: string | null;
  sex: "male" | "female" | null;
  region: string | null;
  zone: string | null;
  woreda: string | null;
  kebele: string | null;
  phone: string | null;
  email: string | null;
  disability: boolean | null;
  notes: string | null;
  status: "active" | "graduated" | "dropped" | "inactive";
  created_at: string;
  updated_at: string;
  organization_id: string | null;
  enterprise_id: string | null;
  education_level: string | null;
  marital_status: string | null;
  disability_type: string | null;
  family_size: number | null;
  is_youth: boolean;
  vulnerability_category: string | null;
  consent_given: boolean;
  consent_date: string | null;
  consent_version: string | null;
  consent_withdrawn_at: string | null;
  data_retention_until: string | null;
  kebele_id: string | null;
  custom: Record<string, unknown>;
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  client_ref: string | null;
}

export interface PartnershipRow {
  id: string;
  created_by: string;
  partner_name: string;
  partner_type: string | null;
  agreement_type: string | null;
  start_date: string | null;
  end_date: string | null;
  region: string | null;
  zone: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: "active" | "pending" | "completed" | "terminated";
  created_at: string;
  updated_at: string;
  organization_id: string | null;
  woreda: string | null;
  kebele: string | null;
  custom: Record<string, unknown>;
  institution_id: string | null;
  sector_focus: string | null;
  geographic_scope: string | null;
  partnership_objective: string | null;
  financial_contribution_amount: number | null;
  in_kind_contribution: string | null;
  renewal_date: string | null;
  in_kind_contribution_value: number | null;
  institutional_strengthening_support: boolean;
}

export interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  organization: string | null;
  position: string | null;
  locale: string | null;
  created_at: string;
  updated_at: string;
  organization_id: string | null;
}

export interface ReflectionMeetingRow {
  id: string;
  organization_id: string | null;
  title: string;
  meeting_type: string;
  meeting_date: string;
  location: string | null;
  participants_count: number;
  female_count: number;
  key_discussion: string | null;
  decisions: string | null;
  action_points: string | null;
  follow_up_status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  custom: Record<string, unknown>;
  youth_count: number;
}

export interface RolePermissionRow {
  id: string;
  organization_id: string | null;
  role: string;
  module: string;
  action: string;
  allowed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleRow {
  key: string;
  label: string;
  description: string | null;
  is_system: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  id: string;
}

export interface SafeguardingCaseRow {
  id: string;
  created_by: string;
  reporter_id: string | null;
  case_type: "sexual_exploitation" | "abuse" | "harassment" | "discrimination" | "child_safeguarding" | "fraud" | "other";
  status: "open" | "investigating" | "closed" | "referred";
  reported_date: string;
  incident_date: string | null;
  description: string | null;
  actions_taken: string | null;
  confidential_notes: string | null;
  created_at: string;
  updated_at: string;
  organization_id: string | null;
  custom: Record<string, unknown>;
}

export interface SbccActivityRow {
  id: string;
  organization_id: string | null;
  created_by: string | null;
  campaign_name: string;
  activity_type: string;
  behaviour_theme: string;
  activity_date: string;
  region: string | null;
  zone: string | null;
  woreda: string | null;
  reach_male: number | null;
  reach_female: number | null;
  reach_youth: number | null;
  materials_distributed: number | null;
  material_type: string | null;
  channel: string | null;
  key_messages: string | null;
  observed_behaviour_change: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  custom: Record<string, unknown>;
  target_audience: string;
  end_date: string | null;
  partner_id: string | null;
  institution_id: string | null;
  knowledge_change_pct: number | null;
  behavior_change_pct: number | null;
  evaluation_method: string;
  kebele: string | null;
  reach_total: number | null;
  reach_female_youth: number | null;
  reach_male_youth: number | null;
  reach_basis: string;
  evaluation_sample_size: number | null;
}

export interface SupportNetworkRow {
  id: string;
  organization_id: string | null;
  created_by: string;
  network_name: string;
  network_type: string;
  description: string | null;
  region: string | null;
  zone: string | null;
  woreda: string | null;
  kebele: string | null;
  contact_phone: string | null;
  institution_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SurveyAnswerRow {
  id: string;
  organization_id: string | null;
  created_by: string;
  response_id: string;
  question_id: string;
  value_text: string | null;
  value_number: number | null;
  value_options: string[];
  created_at: string;
  updated_at: string;
}

export interface SurveyQuestionRow {
  id: string;
  organization_id: string | null;
  created_by: string;
  template_id: string;
  code: string;
  label: string;
  help_text: string | null;
  question_type: string;
  options: string[];
  is_required: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
  min_value: number | null;
  max_value: number | null;
  show_if_code: string | null;
  show_if_value: string | null;
}

export interface SurveyResponseRow {
  id: string;
  organization_id: string | null;
  created_by: string;
  template_id: string;
  participant_id: string | null;
  enterprise_id: string | null;
  respondent_name: string | null;
  respondent_sex: "male" | "female" | null;
  age_group: string | null;
  is_youth: boolean;
  disability: boolean;
  region: string | null;
  zone: string | null;
  woreda: string | null;
  collected_on: string;
  enumerator: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  kebele: string | null;
  client_ref: string | null;
  latitude: number | null;
  longitude: number | null;
  gps_accuracy_m: number | null;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
}

export interface SurveyTemplateRow {
  id: string;
  organization_id: string | null;
  created_by: string;
  title: string;
  description: string | null;
  survey_round: string;
  theme: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  target_sample: number;
  created_at: string;
  updated_at: string;
  custom: Record<string, unknown>;
}

export interface TrainerRow {
  id: string;
  created_by: string;
  name: string;
  phone: string | null;
  partner_id: string | null;
  created_at: string;
  updated_at: string;
  organization_id: string | null;
}

export interface TrainingAssessmentRow {
  id: string;
  created_by: string;
  training_event_id: string;
  participant_id: string;
  score: number | null;
  passed: boolean;
  assessed_on: string;
  assessed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  organization_id: string | null;
}

export interface TrainingAttendanceRow {
  id: string;
  created_by: string;
  training_event_id: string;
  participant_id: string;
  attendance_date: string;
  created_at: string;
  updated_at: string;
  organization_id: string | null;
}

export interface TrainingCertificateRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  training_event_id: string;
  participant_id: string;
  certificate_number: string;
  issued_on: string;
  issued_by: string | null;
  competency: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  revocation_reason: string | null;
}

export interface TrainingEnrollmentRow {
  id: string;
  created_by: string;
  training_event_id: string;
  participant_id: string;
  created_at: string;
  updated_at: string;
  organization_id: string | null;
}

export interface TrainingEventRow {
  id: string;
  created_by: string;
  title: string;
  training_type: string | null;
  start_date: string | null;
  end_date: string | null;
  partner_id: string | null;
  target_participants: number | null;
  status: "planned" | "ongoing" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
  organization_id: string | null;
  region: string | null;
  zone: string | null;
  woreda: string | null;
  other_training_type: string | null;
  trainer_id: string | null;
  kebele: string | null;
  custom: Record<string, unknown>;
}

export interface UserRoleRow {
  id: string;
  user_id: string;
  role: string;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  email_confirmed_at: string | null;
  disabled: boolean;
  last_sign_in_at: string | null;
  created_at: string;
  updated_at: string;
  failed_login_attempts: number;
  locked_until: string | null;
}

export interface WorkplanActivityRow {
  id: string;
  created_by: string;
  organization_id: string | null;
  indicator_id: string | null;
  title: string;
  description: string | null;
  region: string | null;
  zone: string | null;
  responsible: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  progress_percent: number;
  status: "not_started" | "in_progress" | "completed" | "delayed" | "cancelled";
  created_at: string;
  updated_at: string;
  custom: Record<string, unknown>;
  responsible_id: string | null;
  woreda: string | null;
}

export interface YslaGroupMemberRow {
  id: string;
  organization_id: string | null;
  group_id: string;
  participant_id: string;
  joined_date: string;
  created_at: string;
  created_by: string | null;
  role: string;
  individual_savings_balance: number;
  individual_loans_outstanding: number;
  status: string;
  exit_date: string | null;
  updated_at: string;
}

export interface YslaGroupRow {
  id: string;
  organization_id: string | null;
  created_by: string | null;
  group_name: string;
  group_type: string;
  formation_date: string | null;
  region: string | null;
  zone: string | null;
  woreda: string | null;
  kebele: string | null;
  share_value: number | null;
  share_out_date: string | null;
  meeting_frequency: string | null;
  total_savings: number | null;
  total_loans: number | null;
  loan_repayment_rate: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  members_total: number;
  members_female: number;
  members_youth: number;
  custom: Record<string, unknown>;
  linked_fsp_id: string | null;
  chairperson_id: string | null;
  secretary_id: string | null;
  treasurer_id: string | null;
}
