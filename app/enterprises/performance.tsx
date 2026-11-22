import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getEnterprisePerformance,
  getFollowUpPrefill,
  listParticipantsPage,
  participantsCopy,
  type FollowUpPrefill,
  type PerformanceInput,
  type PerformanceVisit,
} from "@/lib/data";
import { ApiError } from "@/lib/api";
import type { Targeted } from "@/lib/queue";
import { PHONE_RE, todayISO } from "@/lib/participant-form";
import { useLookupOptions } from "@/lib/reference";
import {
  errorsFrom,
  makeRef,
  numberOf,
  saveChange,
  saveOrQueue,
  useEditRecord,
  useLiveErrors,
  useQueuedPayload,
  type Errors,
} from "@/lib/field-form";
import {
  FormCard,
  FormScreen,
  FormStep,
  SavedNotice,
} from "@/components/field-form";
import { DateField } from "@/components/date-picker";
import {
  ChoiceRow,
  EmptyState,
  Field,
  Loading,
  Select,
  Text,
} from "@/components/ui";
import { colors, radius, spacing, TOUCH } from "@/theme";

/**
 * A visit waits with its enterprise (`_target`), that enterprise's name and
 * the names shown beside the lead and contact picked (`_names`, never sent).
 */
type QueuedVisit = Targeted<
  PerformanceInput & {
    _name?: string;
    _names?: { lead?: string; lead_age?: string; contact?: string };
  }
>;

/** F02B statuses that need a reason (the API's STOPPED_STATUSES). */
const STOPPED = ["paused", "exited"];
const LISTS = [
  "value_chains",
  "sub_business_types",
  "value_chain_functions",
  "intervention_types",
] as const;
type ListKey = (typeof LISTS)[number];
const YES_NO = [
  "improved_business_plan",
  "additional_initial_package",
  "own_contribution",
  "loan_received",
  "grant_received",
  "leadership_changed",
  "youth_led",
  "pwd_led",
  "idp_led",
  "returnee_led",
] as const;
type YesNoKey = (typeof YES_NO)[number];
const AMOUNTS = [
  ["own_contribution", "own_contribution_amount", "Own contribution"],
  ["loan_received", "loan_amount", "Loan amount"],
  ["grant_received", "grant_amount", "Grant amount"],
] as const;
const TEXTS = [
  "period_start",
  "period_end",
  "revenue",
  "profit",
  "employees_male",
  "employees_female",
  "employees_disability",
  "youth_employees_male",
  "youth_employees_female",
  "youth_employees_disability",
  "markets_count",
  "products_count",
  "main_markets",
  "data_source",
  "notes",
  "enterprise_status",
  "status_reason",
  "registration_status",
  "enterprise_size",
  "rayee_pathway",
  "employment_profile",
  "own_contribution_amount",
  "loan_amount",
  "grant_amount",
  "production_cycles",
  "sales_volume",
  "lead_participant_id",
  "lead_name",
  "lead_age",
  "contact_participant_id",
  "contact_name",
  "contact_role",
  "contact_phone",
  "contact_email",
  "intervention_other",
  "market_expansion_type",
  "market_expansion_other",
  "market_expansion_how",
] as const;
type TextKey = (typeof TEXTS)[number] | YesNoKey;
/** The form: text for each box ("" while empty, "true"/"false" for Yes/No), lists for multi-selects. */
type Form = Record<TextKey, string> & Record<ListKey, string[]>;

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * The quarter a visit is for: the latest calendar quarter that has ended
 * (F02B leaves the frequency open, "quarterly??"; a period cannot end in the
 * future), as on the web.
 */
function reportingQuarter(now = new Date()): { start: string; end: string } {
  const q = Math.floor(now.getMonth() / 3);
  const [y, i] = q === 0 ? [now.getFullYear() - 1, 3] : [now.getFullYear(), q - 1];
  const m = i * 3 + 1;
  return { start: iso(y, m, 1), end: iso(y, m + 2, new Date(Date.UTC(y, m + 2, 0)).getUTCDate()) };
}

function emptyForm(): Form {
  const period = reportingQuarter();
  const form = Object.fromEntries([
    ...TEXTS.map((k) => [k, ""]),
    ...YES_NO.map((k) => [k, ""]),
    ...LISTS.map((k) => [k, []]),
  ]) as unknown as Form;
  return {
    ...form,
    period_start: period.start,
    period_end: period.end,
    data_source: "field_visit",
    employees_disability: "0",
    youth_employees_disability: "0",
    // "No change" by default: the server carries the previous answers forward.
    leadership_changed: "false",
  };
}

/** Values from the server (a visit, the prefill or a queued payload) onto the form. */
function fill(base: Form, values: Record<string, unknown>): Form {
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base)) {
    if (!(key in values) || values[key] === undefined) continue;
    const v = values[key];
    if ((LISTS as readonly string[]).includes(key)) out[key] = Array.isArray(v) ? v.map(String) : [];
    else out[key] = v === null ? "" : String(v);
  }
  return out as Form;
}

/** A visit (being changed) as the form holds it. */
function formFromVisit(r: PerformanceVisit): Form {
  const f = fill(emptyForm(), r as unknown as Record<string, unknown>);
  return { ...f, period_start: r.period_start.slice(0, 10), period_end: r.period_end.slice(0, 10) };
}

/** A queued visit (with the names it kept) as the form holds it. */
function formFromQueued(q: QueuedVisit): Form {
  const f = fill(emptyForm(), q as unknown as Record<string, unknown>);
  // Queued before F02B: no answer is not "no change".
  if (q.leadership_changed === undefined) f.leadership_changed = "";
  return {
    ...f,
    lead_name: q._names?.lead ?? "",
    lead_age: q._names?.lead_age ?? "",
    contact_name: q._names?.contact ?? "",
  };
}

/**
 * A follow-up visit to an enterprise (DMIS F02B): its status and
 * classification, value chain, money, sales, leadership, contact, staff, the
 * support it received and how it expanded its market, for a period. A new
 * visit starts from the last one (or the enterprise's registration). The
 * server checks the same rules and carries leadership forward when it did not
 * change; verification happens on the web.
 */
export default function EnterpriseVisit() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  // `edit` is the visit to change; `id` is its enterprise.
  const edit = useEditRecord<PerformanceVisit>(async (visitId) => {
    const found = (await getEnterprisePerformance(id)).find(
      (v) => v.id === visitId,
    );
    if (!found) throw new Error("This visit was not found.");
    return found;
  }, "visit");
  const queued = useQueuedPayload<QueuedVisit>();
  const fresh = queued.ready && edit.ready && !edit.editing && !queued.payload;
  // A new visit starts from the latest one; without it (offline, never opened) it starts empty.
  const prefill = useQuery({
    queryKey: ["enterprise-follow-up-prefill", id],
    queryFn: () => getFollowUpPrefill(id),
    enabled: fresh && !!id,
    retry: false,
  });
  if (!queued.ready || !edit.ready) return <Loading />;
  // Opened with `edit`: the same form, filled in from the visit, saving a change.
  if (edit.editing) {
    if (!edit.row)
      return (
        <EmptyState
          title="Could not load the visit"
          message={edit.loadError ?? "Try again."}
        />
      );
    const r = edit.row;
    return (
      <VisitForm
        enterpriseId={r.enterprise_id}
        name={name ?? ""}
        initial={formFromVisit(r)}
        clientRef=""
        queuedId={edit.queuedId}
        change={{ id: edit.id!, before: edit.before! }}
      />
    );
  }
  const waiting = queued.payload;
  if (waiting) {
    return (
      <VisitForm
        enterpriseId={waiting._target ?? id}
        name={waiting._name ?? name ?? ""}
        initial={formFromQueued(waiting)}
        clientRef={waiting.client_ref}
        queuedId={queued.queuedId}
      />
    );
  }
  if (prefill.isLoading) return <Loading />;
  return (
    <VisitForm
      enterpriseId={id}
      name={name ?? ""}
      initial={startFrom(prefill.data ?? null)}
      prefill={prefill.data ?? null}
    />
  );
}

function startFrom(prefill: FollowUpPrefill | null): Form {
  if (!prefill) return emptyForm();
  return { ...fill(emptyForm(), prefill.values as Record<string, unknown>), leadership_changed: "false" };
}

const yesNoOptions = [
  { label: "Yes", value: "true" },
  { label: "No", value: "false" },
];

function VisitForm({
  enterpriseId,
  name,
  initial,
  clientRef: keptRef,
  prefill,
  queuedId,
  change,
}: {
  enterpriseId: string;
  name: string;
  initial: Form;
  clientRef?: string;
  prefill?: FollowUpPrefill | null;
  queuedId?: string;
  /** Set when this is a change to an existing visit (the id, and the record as it was). */
  change?: { id: string; before: PerformanceVisit };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const sources = useLookupOptions("enterprise_performance.data_source");
  const statuses = useLookupOptions("enterprise_performance.enterprise_status");
  const registrations = useLookupOptions("enterprises.registration_status");
  const sizes = useLookupOptions("enterprises.enterprise_size");
  const pathways = useLookupOptions("enterprises.rayee_pathway");
  const profiles = useLookupOptions("enterprise_performance.employment_profile");
  const chains = useLookupOptions("enterprises.value_chain");
  const subTypes = useLookupOptions("enterprises.sub_business_types");
  const functions = useLookupOptions("enterprises.value_chain_function");
  const roles = useLookupOptions("enterprises.contact_role");
  const interventions = useLookupOptions("work_enabling_services.category");
  const expansions = useLookupOptions("enterprise_performance.market_expansion_type");
  const [f, setF] = useState<Form>(initial);
  const [clientRef] = useState(() => keptRef || makeRef());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);
  const update = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }));

  // The web's rules and words (lib/enterprise-performance.ts), checked while filling and on Save.
  const counts = {
    employees_male: ["Male staff", 10_000],
    employees_female: ["Female staff", 10_000],
    employees_disability: ["Staff with a disability", 10_000],
    youth_employees_male: ["Young men hired", 10_000],
    youth_employees_female: ["Young women hired", 10_000],
    youth_employees_disability: ["Youth with a disability hired", 10_000],
    markets_count: ["Markets sold to", 1_000],
    products_count: ["Products / services", 1_000],
  } as const;
  const live = useLiveErrors(() => {
    const found: Errors = {};
    if (!f.period_start) found.period_start = "The period start is required";
    if (!f.period_end) found.period_end = "The period end is required";
    else if (f.period_start && f.period_end < f.period_start)
      found.period_end = "The period end cannot be before its start";
    else if (f.period_end > todayISO())
      found.period_end = "The period cannot end in the future";
    if (!f.enterprise_status) found.enterprise_status = "The current status is required";
    else if (STOPPED.includes(f.enterprise_status) && !f.status_reason.trim())
      found.status_reason = "Give the reason the enterprise is paused or has stopped";
    if (!f.enterprise_size) found.enterprise_size = "The enterprise size is required";
    if (!f.rayee_pathway) found.rayee_pathway = "The current pathway is required";
    if (!f.employment_profile) found.employment_profile = "The employment profile is required";
    if (!f.value_chains.length) found.value_chains = "Choose at least one value chain";
    if (!f.sub_business_types.length)
      found.sub_business_types = "Choose at least one sub business type";
    if (!f.value_chain_functions.length)
      found.value_chain_functions = "Choose at least one value chain function";
    const sales = numberOf(f.revenue);
    if (f.revenue.trim() === "" || sales === undefined || !(sales >= 0))
      found.revenue = "Revenue is required and cannot be negative";
    const gain = numberOf(f.profit);
    if (f.profit.trim() !== "" && (gain === undefined || !Number.isFinite(gain)))
      found.profit = "Profit must be a number";
    for (const [flag, amount, label] of AMOUNTS) {
      if (f[flag] !== "true") continue;
      const n = numberOf(f[amount]);
      if (n === undefined || !(n >= 0)) found[amount] = `${label} is required and cannot be negative`;
    }
    const volume = numberOf(f.sales_volume);
    if (f.sales_volume.trim() !== "" && !(volume !== undefined && volume >= 0))
      found.sales_volume = "Sales volume cannot be negative";
    const cycles = numberOf(f.production_cycles);
    if (
      f.production_cycles.trim() !== "" &&
      !(cycles !== undefined && Number.isInteger(cycles) && cycles >= 0 && cycles <= 1000)
    )
      found.production_cycles = "Production cycles must be a whole number from 0 to 1,000";
    if (!f.leadership_changed) found.leadership_changed = "Say whether the leadership changed";
    if (!f.contact_participant_id) found.contact_participant_id = "Choose the contact person";
    if (!f.contact_phone.trim()) found.contact_phone = "The telephone is required";
    else if (!PHONE_RE.test(f.contact_phone.replace(/[\s-]/g, "")))
      found.contact_phone = "Use 09… or 07… (10 digits), or 2519… (12 digits).";
    if (f.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contact_email.trim()))
      found.contact_email = "Enter a valid email";
    for (const [key, [label, max]] of Object.entries(counts)) {
      const text = f[key as keyof typeof counts];
      const n = numberOf(text);
      if (text.trim() === "" || n === undefined || !Number.isInteger(n) || n < 0)
        found[key] = `${label} must be a whole number, 0 or more`;
      else if (n > max) found[key] = `${label} must be at most ${max.toLocaleString("en")}`;
    }
    const num = (text: string) => numberOf(text) ?? 0;
    if (!found.youth_employees_male && num(f.youth_employees_male) > num(f.employees_male))
      found.youth_employees_male = "Young men hired cannot exceed male staff";
    if (!found.youth_employees_female && num(f.youth_employees_female) > num(f.employees_female))
      found.youth_employees_female = "Young women hired cannot exceed female staff";
    if (
      !found.employees_disability &&
      num(f.employees_disability) > num(f.employees_male) + num(f.employees_female)
    )
      found.employees_disability = "Staff with a disability cannot exceed all staff";
    if (
      !found.youth_employees_disability &&
      num(f.youth_employees_disability) > num(f.youth_employees_male) + num(f.youth_employees_female)
    )
      found.youth_employees_disability = "Youth with a disability cannot exceed the youth hired";
    if (!f.intervention_types.length)
      found.intervention_types = "Choose at least one intervention type";
    if (!f.market_expansion_type)
      found.market_expansion_type = "The market expansion type is required";
    else if (f.market_expansion_type === "other" && !f.market_expansion_other.trim())
      found.market_expansion_other = "Specify the other market expansion";
    return found;
  });
  const { errors } = live;

  /** What is sent: an answer that follows another only with it, numbers as numbers. */
  function body(): PerformanceInput {
    const text = (v: string) => (v.trim() === "" ? null : v.trim());
    const n = (v: string) => numberOf(v) ?? null;
    const yn = (v: string) => (v === "true" ? true : v === "false" ? false : null);
    const flags = Object.fromEntries(YES_NO.map((k) => [k, yn(f[k])])) as Record<YesNoKey, boolean | null>;
    return {
      period_start: f.period_start,
      period_end: f.period_end,
      revenue: numberOf(f.revenue)!,
      profit: numberOf(f.profit),
      employees_male: numberOf(f.employees_male) ?? 0,
      employees_female: numberOf(f.employees_female) ?? 0,
      youth_employees_male: numberOf(f.youth_employees_male) ?? 0,
      youth_employees_female: numberOf(f.youth_employees_female) ?? 0,
      employees_disability: numberOf(f.employees_disability) ?? 0,
      youth_employees_disability: numberOf(f.youth_employees_disability) ?? 0,
      markets_count: numberOf(f.markets_count) ?? 0,
      products_count: numberOf(f.products_count) ?? 0,
      main_markets: f.main_markets.trim() || undefined,
      data_source: f.data_source,
      notes: f.notes.trim() || undefined,
      client_ref: clientRef,
      ...flags,
      enterprise_status: text(f.enterprise_status),
      status_reason: STOPPED.includes(f.enterprise_status) ? text(f.status_reason) : null,
      registration_status: text(f.registration_status),
      enterprise_size: text(f.enterprise_size),
      rayee_pathway: text(f.rayee_pathway),
      employment_profile: text(f.employment_profile),
      value_chains: f.value_chains,
      sub_business_types: f.sub_business_types,
      value_chain_functions: f.value_chain_functions,
      own_contribution_amount: flags.own_contribution ? n(f.own_contribution_amount) : null,
      loan_amount: flags.loan_received ? n(f.loan_amount) : null,
      grant_amount: flags.grant_received ? n(f.grant_amount) : null,
      production_cycles: n(f.production_cycles),
      sales_volume: n(f.sales_volume),
      // With no change the server copies the previous answers over these.
      lead_participant_id: text(f.lead_participant_id),
      contact_participant_id: text(f.contact_participant_id),
      contact_role: text(f.contact_role),
      contact_phone: text(f.contact_phone),
      contact_email: text(f.contact_email),
      intervention_types: f.intervention_types,
      intervention_other: text(f.intervention_other),
      market_expansion_type: text(f.market_expansion_type),
      market_expansion_other: f.market_expansion_type === "other" ? text(f.market_expansion_other) : null,
      market_expansion_how: text(f.market_expansion_how),
    };
  }

  async function handleSave() {
    if (!live.submit()) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const payload: QueuedVisit = {
      ...body(),
      _target: enterpriseId,
      _name: name || undefined,
      _names: { lead: f.lead_name, lead_age: f.lead_age, contact: f.contact_name },
    };
    setSaving(true);
    try {
      if (change) {
        // The whole visit is sent again: the server takes it as one record.
        const { _target: _t, _name: _n, _names: _m, client_ref: _r, ...sent } = payload;
        const outcome = await saveChange({
          kind: "performance_edit",
          label: `Change to the visit — ${name || "enterprise"}, ${f.period_start} to ${f.period_end}`,
          id: change.id,
          before: change.before,
          after: sent,
          body: sent,
          queuedId,
        });
        await queryClient.invalidateQueries({
          queryKey: ["enterprise-performance", enterpriseId],
        });
        if (outcome === "sent") router.back();
        else setDone("queued");
        return;
      }
      setDone(
        await saveOrQueue({
          kind: "enterprise_performance",
          label: `Visit — ${name || "enterprise"}, ${f.period_start} to ${f.period_end}`,
          payload,
          queuedId,
        }),
      );
    } catch (err) {
      live.setServer(errorsFrom(err, "Could not save the visit"));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  if (done)
    return (
      <SavedNotice
        queued={done === "queued"}
        what={change ? "change" : "visit"}
        another={!change}
      />
    );

  /** A text box bound to the form. */
  const box = (
    k: TextKey,
    label: string,
    opts: {
      required?: boolean;
      hint?: string;
      keyboardType?: "number-pad" | "decimal-pad" | "numbers-and-punctuation" | "phone-pad" | "email-address";
      multiline?: boolean;
      maxLength?: number;
    } = {},
  ) => (
    <Field
      label={label}
      required={opts.required}
      value={f[k]}
      onChangeText={(v) => update({ [k]: v } as Partial<Form>)}
      onBlur={() => live.touch(k)}
      keyboardType={opts.keyboardType}
      multiline={opts.multiline}
      maxLength={opts.maxLength}
      hint={opts.hint}
      error={errors[k]}
    />
  );
  /** One choice from a Reference data list. */
  const pick = (
    k: TextKey,
    label: string,
    options: { label: string; value: string }[],
    required = false,
    onChange?: (v: string) => void,
  ) => (
    <Select
      label={label}
      required={required}
      value={f[k] || undefined}
      options={options}
      onChange={(v) => {
        if (onChange) onChange(v);
        else update({ [k]: v } as Partial<Form>);
        live.touch(k);
      }}
      error={errors[k]}
    />
  );
  const yesNo = (k: YesNoKey, label: string, onChange?: (v: string) => void, required = false) => (
    <ChoiceRow
      label={label}
      required={required}
      value={f[k] || undefined}
      options={yesNoOptions}
      onChange={(v) => {
        if (onChange) onChange(v);
        else update({ [k]: v } as Partial<Form>);
        live.touch(k);
      }}
      error={errors[k]}
    />
  );
  const many = (k: ListKey, label: string, options: { label: string; value: string }[]) => (
    <MultiChoice
      label={label}
      required
      value={f[k]}
      options={options}
      onChange={(v) => {
        update({ [k]: v } as Partial<Form>);
        live.touch(k);
      }}
      error={errors[k]}
    />
  );
  const withAmount = (
    flag: (typeof AMOUNTS)[number][0],
    amount: (typeof AMOUNTS)[number][1],
    question: string,
    label: string,
  ) => (
    <>
      {yesNo(flag, question, (v) => update({ [flag]: v, ...(v === "true" ? {} : { [amount]: "" }) }))}
      {f[flag] === "true"
        ? box(amount, label, { required: true, keyboardType: "decimal-pad" })
        : null}
    </>
  );
  const stopped = STOPPED.includes(f.enterprise_status);
  const yn = (v: string) => (v === "true" ? "Yes" : v === "false" ? "No" : "—");

  return (
    <FormScreen
      ref={scroll}
      error={errors.form}
      saveTitle={change ? "Save changes" : "Save the visit"}
      saving={saving}
      onSave={handleSave}
      steps={{
        titles: ["Period & status", "Value chain", "Money & sales", "Leadership & contact", "Staff", "Support & markets"],
        fields: [
          ["period_start", "period_end", "enterprise_status", "status_reason", "enterprise_size", "rayee_pathway", "employment_profile"],
          ["value_chains", "sub_business_types", "value_chain_functions"],
          ["revenue", "profit", "own_contribution_amount", "loan_amount", "grant_amount", "production_cycles", "sales_volume", "markets_count", "products_count"],
          ["leadership_changed", "contact_participant_id", "contact_phone", "contact_email"],
          ["employees_male", "employees_female", "employees_disability", "youth_employees_male", "youth_employees_female", "youth_employees_disability"],
          ["intervention_types", "market_expansion_type", "market_expansion_other"],
        ],
        check: live.checkStep,
        errors,
      }}
    >
      <FormStep index={0}>
        <FormCard
          title={name || "Enterprise visit"}
          hint={
            prefill
              ? prefill.source === "follow_up"
                ? `Filled in from the last visit${prefill.period_label ? ` (${prefill.period_label})` : ""}: check each answer.`
                : "Filled in from the enterprise's registration: check each answer."
              : "Figures for the period, as the owner reports them or the records show."
          }
        >
          <DateField
            label="Period start"
            required
            value={f.period_start}
            onChange={(v) => {
              update({ period_start: v });
              live.touch("period_start");
              live.touch("period_end");
            }}
            max={todayISO()}
            error={errors.period_start}
          />
          <DateField
            label="Period end"
            required
            value={f.period_end}
            onChange={(v) => {
              update({ period_end: v });
              live.touch("period_end");
            }}
            max={todayISO()}
            error={errors.period_end}
          />
          {sources.length > 0 ? pick("data_source", "Data source", sources) : null}
        </FormCard>
        <FormCard title="Status & classification">
          {pick("enterprise_status", "Current enterprise status", statuses, true, (v) =>
            update({ enterprise_status: v, ...(STOPPED.includes(v) ? {} : { status_reason: "" }) }),
          )}
          {stopped ? box("status_reason", "Reason it is paused or stopped", { required: true, maxLength: 1000 }) : null}
          {pick("registration_status", "Registration status", registrations)}
          {pick("enterprise_size", "Enterprise size", sizes, true)}
          {yesNo("improved_business_plan", "Has an improved business plan?")}
          {pick("rayee_pathway", "RAYEE II current pathway", pathways, true)}
          {pick("employment_profile", "Current employment profile", profiles, true)}
        </FormCard>
      </FormStep>
      <FormStep index={1}>
        <FormCard title="Value chain">
          {many("value_chains", "Current value chains", chains)}
          {many("sub_business_types", "Sub business types", subTypes)}
          {many("value_chain_functions", "Value chain functions", functions)}
          {yesNo("additional_initial_package", "Additional initial package (different value chain)?")}
        </FormCard>
      </FormStep>
      <FormStep index={2}>
        <FormCard title="Finance">
          {withAmount("own_contribution", "own_contribution_amount", "Own resource contribution (incl. saving)?", "Own contribution")}
          {withAmount("loan_received", "loan_amount", "Received a loan?", "Loan amount")}
          {withAmount("grant_received", "grant_amount", "Received a grant?", "Grant amount")}
          {box("revenue", "Current revenue", { required: true, keyboardType: "decimal-pad", hint: "At the time of reporting." })}
          {box("profit", "Profit", {
            keyboardType: "numbers-and-punctuation",
            hint: "A loss is a negative number. Leave empty if not known.",
          })}
        </FormCard>
        <FormCard title="Production & sales">
          {box("production_cycles", "Production cycles in the period", { keyboardType: "number-pad" })}
          {box("sales_volume", "Sales volume", { keyboardType: "decimal-pad" })}
          {box("markets_count", "Markets sold to", { required: true, keyboardType: "number-pad" })}
          {box("products_count", "Products / services", { required: true, keyboardType: "number-pad" })}
          {box("main_markets", "Main markets", { maxLength: 500 })}
        </FormCard>
      </FormStep>
      <FormStep index={3}>
        <FormCard title="Leadership">
          {yesNo("leadership_changed", "Any change in leadership or ownership?", undefined, true)}
          {f.leadership_changed === "true" ? (
            <>
              {yesNo("youth_led", "Youth-led?")}
              {yesNo("pwd_led", "Led by a person with a disability?")}
              {yesNo("idp_led", "IDP-led?")}
              {yesNo("returnee_led", "Returnee-led?")}
              <PersonPick
                label="Lead"
                name={f.lead_name}
                hint={f.lead_age ? `Age ${f.lead_age}, from their registration.` : undefined}
                onPick={(p) =>
                  update({
                    lead_participant_id: p?.id ?? "",
                    lead_name: p?.full_name ?? "",
                    lead_age: p ? ageText(p.date_of_birth) : "",
                  })
                }
              />
            </>
          ) : (
            <Text style={styles.note}>
              {`No change: the previous answers are kept. Youth-led ${yn(f.youth_led)} · PWD-led ${yn(f.pwd_led)} · IDP-led ${yn(f.idp_led)} · Returnee-led ${yn(f.returnee_led)} · Lead ${f.lead_name || "—"}${f.lead_age ? ` (${f.lead_age})` : ""}`}
            </Text>
          )}
        </FormCard>
        <FormCard title="Current contact">
          <PersonPick
            label="Contact person"
            required
            name={f.contact_name}
            error={errors.contact_participant_id}
            onPick={(p) => {
              update({
                contact_participant_id: p?.id ?? "",
                contact_name: p?.full_name ?? "",
                ...(p?.phone && !f.contact_phone ? { contact_phone: p.phone } : {}),
              });
              live.touch("contact_participant_id");
            }}
          />
          {pick("contact_role", "Role of the contact person", roles)}
          {box("contact_phone", "Telephone", { required: true, keyboardType: "phone-pad" })}
          {box("contact_email", "Email", { keyboardType: "email-address", maxLength: 255 })}
        </FormCard>
      </FormStep>
      <FormStep index={4}>
        <FormCard
          title="Staff"
          hint="At the time of reporting. Wage youth hired as a result of RAYEE II are counted within the staff."
        >
          {box("employees_male", "Staff: male", { required: true, keyboardType: "number-pad" })}
          {box("employees_female", "Staff: female", { required: true, keyboardType: "number-pad" })}
          {box("employees_disability", "Staff: with a disability", { keyboardType: "number-pad" })}
          {box("youth_employees_male", "Wage youth hired: male", { required: true, keyboardType: "number-pad" })}
          {box("youth_employees_female", "Wage youth hired: female", { required: true, keyboardType: "number-pad" })}
          {box("youth_employees_disability", "Wage youth hired: with a disability", { keyboardType: "number-pad" })}
        </FormCard>
      </FormStep>
      <FormStep index={5}>
        <FormCard title="Interventions & market expansion">
          {many("intervention_types", "Intervention type / support received", interventions)}
          {box("intervention_other", "Other intervention, please specify", { maxLength: 500 })}
          {pick("market_expansion_type", "Market expansion / diversification type", expansions, true, (v) =>
            update({ market_expansion_type: v, ...(v === "other" ? {} : { market_expansion_other: "" }) }),
          )}
          {f.market_expansion_type === "other"
            ? box("market_expansion_other", "Other market expansion, please specify", { required: true, maxLength: 200 })
            : null}
          {box("market_expansion_how", "How was the market expanded or diversified?", { multiline: true, maxLength: 2000 })}
          {box("notes", "Notes", { multiline: true, maxLength: 2000 })}
        </FormCard>
      </FormStep>
    </FormScreen>
  );
}

/** Whole years from a YYYY-MM-DD birth date, as text ("" when unknown). */
function ageText(dob: string | null | undefined): string {
  if (!dob) return "";
  const [y, m, d] = dob.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age >= 0 ? String(age) : "";
}

/** Several ticked choices from a list, as chips. */
function MultiChoice({
  label,
  required,
  value,
  options,
  onChange,
  error,
}: {
  label: string;
  required?: boolean;
  value: string[];
  options: { label: string; value: string }[];
  onChange: (value: string[]) => void;
  error?: string | null;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View style={styles.chipRow}>
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <Pressable
              key={o.value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

type Person = { id: string; full_name: string; date_of_birth?: string | null; phone?: string | null };

/** The first approved participants matching a search: from the server, or offline from the phone's copy. */
async function findPeople(term: string): Promise<Person[]> {
  try {
    return (await listParticipantsPage({ q: term, limit: 6, offset: 0 })).rows;
  } catch (error) {
    if (error instanceof ApiError && error.isNetworkError) {
      return (await participantsCopy.query({ term, limit: 6 })).rows;
    }
    throw error;
  }
}

/** A participant picked by searching their name (the lead, the contact person). */
function PersonPick({
  label,
  required,
  name,
  hint,
  error,
  onPick,
}: {
  label: string;
  required?: boolean;
  name: string;
  hint?: string;
  error?: string | null;
  onPick: (person: Person | null) => void;
}) {
  const [searching, setSearching] = useState(!name);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const found = useQuery({
    queryKey: ["follow-up-person", term],
    queryFn: () => findPeople(term),
    enabled: searching && term.length >= 2,
  });
  if (!searching && name) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        <View style={styles.picked}>
          <Text style={styles.pickedName}>{name}</Text>
          <Pressable accessibilityRole="button" onPress={() => setSearching(true)} style={styles.change}>
            <Text style={styles.changeText}>Change</Text>
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    );
  }
  return (
    <View style={styles.field}>
      <Field
        label={label}
        required={required}
        value={search}
        onChangeText={setSearch}
        placeholder="Type at least 2 letters of their name"
        hint={hint}
        error={error}
      />
      {(found.data ?? []).map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          onPress={() => {
            onPick(p);
            setSearch("");
            setSearching(false);
          }}
          style={styles.result}
        >
          <Text>{p.full_name}</Text>
        </Pressable>
      ))}
      {term.length >= 2 && found.data?.length === 0 ? <Text style={styles.hint}>No participant found.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text },
  required: { color: colors.danger },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  error: { fontSize: 12, color: colors.danger },
  note: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    minHeight: TOUCH - 4,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.white, fontWeight: "700" },
  picked: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: TOUCH,
  },
  pickedName: { fontSize: 15, color: colors.text, flexShrink: 1 },
  change: { paddingHorizontal: spacing.sm, minHeight: TOUCH, justifyContent: "center" },
  changeText: { color: colors.primary, fontWeight: "700" },
  result: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: TOUCH,
    justifyContent: "center",
  },
});
