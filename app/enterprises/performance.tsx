import { useRef, useState } from "react";
import { type ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getEnterprisePerformance,
  type PerformanceInput,
  type PerformanceVisit,
} from "@/lib/data";
import type { Targeted } from "@/lib/queue";
import { todayISO } from "@/lib/participant-form";
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
import { EmptyState, Field, Loading, Select } from "@/components/ui";

/** A visit waits with its enterprise (`_target`) and that enterprise's name. */
type QueuedVisit = Targeted<PerformanceInput & { _name?: string }>;

/** The first and last day of last month: the usual period of a monthly visit. */
function lastMonth(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/**
 * A follow-up visit to an enterprise: sales, profit and who works there over
 * a period. The server checks the same rules (no period ending in the future,
 * youth not more than workers) and verification happens on the web.
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
        initial={{
          period_start: r.period_start.slice(0, 10),
          period_end: r.period_end.slice(0, 10),
          revenue: Number(r.revenue),
          profit: r.profit != null ? Number(r.profit) : undefined,
          employees_male: r.employees_male,
          employees_female: r.employees_female,
          youth_employees_male: r.youth_employees_male,
          youth_employees_female: r.youth_employees_female,
          employees_disability: r.employees_disability,
          markets_count: r.markets_count,
          products_count: r.products_count,
          main_markets: r.main_markets ?? undefined,
          data_source: r.data_source,
          notes: r.notes ?? undefined,
          client_ref: "",
          _target: r.enterprise_id,
        }}
        queuedId={edit.queuedId}
        change={{ id: edit.id!, before: edit.before! }}
      />
    );
  }
  const initial = queued.payload;
  return (
    <VisitForm
      enterpriseId={initial?._target ?? id}
      name={initial?._name ?? name ?? ""}
      initial={initial}
      queuedId={queued.queuedId}
    />
  );
}

function VisitForm({
  enterpriseId,
  name,
  initial,
  queuedId,
  change,
}: {
  enterpriseId: string;
  name: string;
  initial: QueuedVisit | null;
  queuedId?: string;
  /** Set when this is a change to an existing visit (the id, and the record as it was). */
  change?: { id: string; before: PerformanceVisit };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const sources = useLookupOptions("enterprise_performance.data_source");
  const period = lastMonth();
  const text = (n: number | undefined) =>
    n === undefined || n === null ? "" : String(n);
  const [start, setStart] = useState(initial?.period_start ?? period.start);
  const [end, setEnd] = useState(initial?.period_end ?? period.end);
  const [revenue, setRevenue] = useState(text(initial?.revenue));
  const [profit, setProfit] = useState(text(initial?.profit));
  const [men, setMen] = useState(text(initial?.employees_male));
  const [women, setWomen] = useState(text(initial?.employees_female));
  const [youngMen, setYoungMen] = useState(text(initial?.youth_employees_male));
  const [youngWomen, setYoungWomen] = useState(
    text(initial?.youth_employees_female),
  );
  const [disabled, setDisabled] = useState(
    text(initial?.employees_disability ?? 0),
  );
  const [markets, setMarkets] = useState(text(initial?.markets_count));
  const [products, setProducts] = useState(text(initial?.products_count));
  const [mainMarkets, setMainMarkets] = useState(initial?.main_markets ?? "");
  const [source, setSource] = useState(initial?.data_source ?? "field_visit");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [clientRef] = useState(() => initial?.client_ref ?? makeRef());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);

  // The web's rules and words (lib/enterprise-performance.ts), checked while filling and on Save.
  const sales = numberOf(revenue);
  const gain = numberOf(profit);
  const counts = {
    employees_male: [men, "Male workers", 10_000],
    employees_female: [women, "Female workers", 10_000],
    youth_employees_male: [youngMen, "Young men", 10_000],
    youth_employees_female: [youngWomen, "Young women", 10_000],
    employees_disability: [disabled, "Workers with a disability", 10_000],
    markets_count: [markets, "Markets sold to", 1_000],
    products_count: [products, "Products / services", 1_000],
  } as const;
  const live = useLiveErrors(() => {
    const found: Errors = {};
    if (!start) found.period_start = "The period start is required";
    if (!end) found.period_end = "The period end is required";
    else if (start && end < start)
      found.period_end = "The period end cannot be before its start";
    else if (end > todayISO())
      found.period_end = "The period cannot end in the future";
    if (revenue.trim() === "" || sales === undefined || !(sales >= 0))
      found.revenue = "Revenue is required and cannot be negative";
    if (profit.trim() !== "" && (gain === undefined || !Number.isFinite(gain)))
      found.profit = "Profit must be a number";
    for (const [key, [text, label, max]] of Object.entries(counts)) {
      const n = numberOf(text);
      if (
        text.trim() === "" ||
        n === undefined ||
        !Number.isInteger(n) ||
        n < 0
      )
        found[key] = `${label} must be a whole number, 0 or more`;
      else if (n > max)
        found[key] = `${label} must be at most ${max.toLocaleString("en")}`;
    }
    const num = (text: string) => numberOf(text) ?? 0;
    if (!found.youth_employees_male && num(youngMen) > num(men))
      found.youth_employees_male = "Young men cannot exceed male workers";
    if (!found.youth_employees_female && num(youngWomen) > num(women))
      found.youth_employees_female = "Young women cannot exceed female workers";
    if (!found.employees_disability && num(disabled) > num(men) + num(women))
      found.employees_disability =
        "Workers with a disability cannot exceed all workers";
    return found;
  });
  const { errors } = live;
  const count = (value: string) => numberOf(value) ?? 0;
  const m = count(men);
  const w = count(women);
  const ym = count(youngMen);
  const yw = count(youngWomen);
  const d = count(disabled);
  const mk = count(markets);
  const pr = count(products);

  async function handleSave() {
    if (!live.submit()) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const payload: QueuedVisit = {
      period_start: start,
      period_end: end,
      revenue: sales!,
      profit: gain,
      employees_male: m,
      employees_female: w,
      youth_employees_male: ym,
      youth_employees_female: yw,
      employees_disability: d,
      markets_count: mk,
      products_count: pr,
      main_markets: mainMarkets.trim() || undefined,
      data_source: source,
      notes: notes.trim() || undefined,
      client_ref: clientRef,
      _target: enterpriseId,
      _name: name || undefined,
    };
    setSaving(true);
    try {
      if (change) {
        // The whole visit is sent again: the server takes it as one record.
        const { _target: _t, _name: _n, client_ref: _r, ...body } = payload;
        const sent = await saveChange({
          kind: "performance_edit",
          label: `Change to the visit — ${name || "enterprise"}, ${start} to ${end}`,
          id: change.id,
          before: change.before,
          after: body,
          body,
          queuedId,
        });
        await queryClient.invalidateQueries({
          queryKey: ["enterprise-performance", enterpriseId],
        });
        if (sent === "sent") router.back();
        else setDone("queued");
        return;
      }
      setDone(
        await saveOrQueue({
          kind: "enterprise_performance",
          label: `Visit — ${name || "enterprise"}, ${start} to ${end}`,
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

  return (
    <FormScreen
      ref={scroll}
      error={errors.form}
      saveTitle={change ? "Save changes" : "Save the visit"}
      saving={saving}
      onSave={handleSave}
      steps={{
        titles: ["Period & money", "Workers", "Markets"],
        fields: [
          ["period_start", "period_end", "revenue", "profit"],
          [
            "employees_male",
            "employees_female",
            "youth_employees_male",
            "youth_employees_female",
            "employees_disability",
          ],
          ["markets_count", "products_count"],
        ],
        check: live.checkStep,
        errors,
      }}
    >
      <FormStep index={0}>
        <FormCard
          title={name || "Enterprise visit"}
          hint="Figures for the period, as the owner reports them or the records show."
        >
          <DateField
            label="Period start"
            required
            value={start}
            onChange={(v) => {
              setStart(v);
              live.touch("period_start");
              live.touch("period_end");
            }}
            max={todayISO()}
            error={errors.period_start}
          />
          <DateField
            label="Period end"
            required
            value={end}
            onChange={(v) => {
              setEnd(v);
              live.touch("period_end");
            }}
            max={todayISO()}
            error={errors.period_end}
          />
          <Field
            label="Revenue"
            required
            value={revenue}
            onChangeText={setRevenue}
            onBlur={() => live.touch("revenue")}
            keyboardType="decimal-pad"
            error={errors.revenue}
          />
          <Field
            label="Profit"
            value={profit}
            onChangeText={setProfit}
            onBlur={() => live.touch("profit")}
            keyboardType="numbers-and-punctuation"
            hint="A loss is a negative number. Leave empty if not known."
            error={errors.profit}
          />
        </FormCard>
      </FormStep>
      <FormStep index={1}>
        <FormCard title="Workers">
          <Field
            label="Male workers"
            required
            value={men}
            onChangeText={setMen}
            onBlur={() => live.touch("employees_male")}
            keyboardType="number-pad"
            error={errors.employees_male}
          />
          <Field
            label="Female workers"
            required
            value={women}
            onChangeText={setWomen}
            onBlur={() => live.touch("employees_female")}
            keyboardType="number-pad"
            error={errors.employees_female}
          />
          <Field
            label="Of whom young men"
            required
            value={youngMen}
            onChangeText={setYoungMen}
            onBlur={() => live.touch("youth_employees_male")}
            keyboardType="number-pad"
            error={errors.youth_employees_male}
          />
          <Field
            label="Of whom young women"
            required
            value={youngWomen}
            onChangeText={setYoungWomen}
            onBlur={() => live.touch("youth_employees_female")}
            keyboardType="number-pad"
            error={errors.youth_employees_female}
          />
          <Field
            label="Workers with a disability"
            value={disabled}
            onChangeText={setDisabled}
            onBlur={() => live.touch("employees_disability")}
            keyboardType="number-pad"
            error={errors.employees_disability}
          />
        </FormCard>
      </FormStep>
      <FormStep index={2}>
        <FormCard title="Markets">
          <Field
            label="Markets sold to"
            required
            value={markets}
            onChangeText={setMarkets}
            onBlur={() => live.touch("markets_count")}
            keyboardType="number-pad"
            error={errors.markets_count}
          />
          <Field
            label="Products / services"
            required
            value={products}
            onChangeText={setProducts}
            onBlur={() => live.touch("products_count")}
            keyboardType="number-pad"
            error={errors.products_count}
          />
          <Field
            label="Main markets"
            value={mainMarkets}
            onChangeText={setMainMarkets}
            maxLength={500}
          />
          {sources.length > 0 ? (
            <Select
              label="Data source"
              value={source}
              options={sources}
              onChange={setSource}
            />
          ) : null}
          <Field
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={2000}
          />
        </FormCard>
      </FormStep>
    </FormScreen>
  );
}
