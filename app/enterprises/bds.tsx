import { useRef, useState } from "react";
import { type ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cachedFetch } from "@/lib/offline-cache";
import { todayISO } from "@/lib/participant-form";
import {
  errorsFrom,
  makeRef,
  saveOrQueue,
  useLiveErrors,
  useQueuedPayload,
  type Errors,
} from "@/lib/field-form";
import { useLookupOptions } from "@/lib/reference";
import { FormCard, FormScreen, SavedNotice } from "@/components/field-form";
import { DateField } from "@/components/date-picker";
import { ChoiceRow, Field, Loading, Select } from "@/components/ui";

/**
 * DMIS F02D: a business development service (BDS) an enterprise received,
 * recorded from its page. The provider is the signed-in staff member (the
 * default) or an LSP from the LSP register, kept on the phone for offline
 * use. The server reads the enterprise's region, zone and woreda from its
 * record, so this works offline: it waits in the queue and is sent on the
 * next sync (client_ref: sent twice, saved once).
 */
type BdsBody = {
  enterprise_id: string;
  service_type: string;
  service_type_other?: string;
  service_date: string;
  provider_kind: "staff" | "lsp";
  staff_user_id?: string;
  service_provider_id?: string;
  actions_provided: string;
  enterprise_measures?: string;
  next_follow_up_date?: string;
  client_ref: string;
};
type QueuedBds = BdsBody & { _enterprise?: string };

type Lsp = { id: string; provider_name: string; status: string };

/**
 * The LSPs to choose from, kept for offline use. Empty when this role may
 * not read the LSP register (or it was never downloaded).
 */
async function loadLsps(): Promise<Lsp[]> {
  try {
    const rows = await cachedFetch("service-providers", () => api.get<Lsp[]>("/service-providers"));
    return rows.filter((p) => p.status === "active");
  } catch (error) {
    if (error instanceof ApiError) return [];
    throw error;
  }
}

export default function RecordBds() {
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const queued = useQueuedPayload<QueuedBds>();
  if (!queued.ready) return <Loading />;
  const initial = queued.payload;
  return (
    <BdsForm
      initial={initial}
      enterprise={initial?.enterprise_id ?? id ?? ""}
      enterpriseName={initial?._enterprise ?? name ?? ""}
      queuedId={queued.queuedId}
    />
  );
}

function BdsForm({
  initial,
  enterprise,
  enterpriseName,
  queuedId,
}: {
  initial: QueuedBds | null;
  enterprise: string;
  enterpriseName: string;
  queuedId?: string;
}) {
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const { user } = useAuth();
  const types = useLookupOptions("bds_services.service_type");
  const lsps = useQuery({ queryKey: ["bds-lsps"], queryFn: loadLsps });
  const [clientRef] = useState(() => initial?.client_ref ?? makeRef());
  const [type, setType] = useState(initial?.service_type ?? "");
  const [typeOther, setTypeOther] = useState(initial?.service_type_other ?? "");
  const [date, setDate] = useState(initial?.service_date ?? todayISO());
  const [kind, setKind] = useState<"staff" | "lsp">(initial?.provider_kind ?? "staff");
  const [lsp, setLsp] = useState(initial?.service_provider_id ?? "");
  const [actions, setActions] = useState(initial?.actions_provided ?? "");
  const [measures, setMeasures] = useState(initial?.enterprise_measures ?? "");
  const [next, setNext] = useState(initial?.next_follow_up_date ?? "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);
  // Staff: whoever recorded it (kept from the queued copy when corrected later).
  const staffId = initial?.staff_user_id ?? user?.id ?? "";

  const live = useLiveErrors(() => {
    const found: Errors = {};
    if (!enterprise) found.form = "Open this from the enterprise that received the service.";
    if (!type) found.service_type = "Choose the BDS service type";
    else if (type === "other" && !typeOther.trim()) found.service_type_other = "Say which service it was";
    if (!date) found.service_date = "Date is required";
    else if (date > todayISO()) found.service_date = "The date cannot be in the future";
    if (kind === "staff" && !staffId) found.form = "Sign in again to record a service as staff.";
    if (kind === "lsp" && !lsp) found.service_provider_id = "Choose the LSP who provided the service";
    if (!actions.trim()) found.actions_provided = "Describe the actions or feedback provided";
    if (next && date && next < date) found.next_follow_up_date = "Cannot be before the service date";
    return found;
  });
  const { errors } = live;

  async function handleSave() {
    if (!live.submit()) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const payload: QueuedBds = {
      enterprise_id: enterprise,
      service_type: type,
      service_type_other: type === "other" ? typeOther.trim() : undefined,
      service_date: date,
      provider_kind: kind,
      staff_user_id: kind === "staff" ? staffId : undefined,
      service_provider_id: kind === "lsp" ? lsp : undefined,
      actions_provided: actions.trim(),
      enterprise_measures: measures.trim() || undefined,
      next_follow_up_date: next || undefined,
      client_ref: clientRef,
      _enterprise: enterpriseName || undefined,
    };
    setSaving(true);
    try {
      const result = await saveOrQueue({
        kind: "bds_service",
        label: `BDS service — ${enterpriseName || "enterprise"}`,
        payload,
        queuedId,
      });
      if (result === "sent") await queryClient.invalidateQueries({ queryKey: ["enterprise-bds", enterprise] });
      setDone(result);
    } catch (err) {
      live.setServer(errorsFrom(err, "Could not save the BDS service"));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  if (done) return <SavedNotice queued={done === "queued"} what="BDS service" />;

  const lspOptions = (lsps.data ?? []).map((p) => ({ label: p.provider_name, value: p.id }));

  return (
    <FormScreen ref={scroll} error={errors.form} saveTitle="Save the service" saving={saving} onSave={() => void handleSave()}>
      <FormCard
        title={enterpriseName ? `BDS for ${enterpriseName}` : "BDS service"}
        hint="The enterprise's region, zone and woreda are taken from its record."
      >
        <Select
          label="BDS service type"
          required
          value={type || undefined}
          options={types}
          onChange={(v) => {
            setType(v);
            live.touch("service_type");
          }}
          placeholder={types.length ? "Select" : "Connect once to load the list"}
          error={errors.service_type}
        />
        {type === "other" ? (
          <Field
            label="Other service type"
            required
            value={typeOther}
            onChangeText={setTypeOther}
            onBlur={() => live.touch("service_type_other")}
            maxLength={200}
            error={errors.service_type_other}
          />
        ) : null}
        <DateField
          label="Service date"
          required
          value={date}
          onChange={(v) => {
            setDate(v);
            live.touch("service_date");
          }}
          max={todayISO()}
          error={errors.service_date}
        />
      </FormCard>
      <FormCard title="Provider">
        <ChoiceRow
          label="BDS service provider"
          required
          value={kind}
          options={[
            { label: "Me (staff)", value: "staff" },
            { label: "LSP", value: "lsp" },
          ]}
          onChange={setKind}
        />
        {kind === "lsp" ? (
          <Select
            label="Service provider (LSP)"
            required
            value={lsp || undefined}
            options={lspOptions}
            onChange={(v) => {
              setLsp(v);
              live.touch("service_provider_id");
            }}
            placeholder={
              lsps.isLoading ? "Loading…" : lspOptions.length ? "Select" : "No LSP available: connect once to load the list"
            }
            error={errors.service_provider_id}
          />
        ) : null}
      </FormCard>
      <FormCard title="Follow-up">
        <Field
          label="Actions / feedback provided"
          required
          value={actions}
          onChangeText={setActions}
          onBlur={() => live.touch("actions_provided")}
          multiline
          maxLength={4000}
          error={errors.actions_provided}
        />
        <Field
          label="Follow-up / measures taken by the enterprise"
          value={measures}
          onChangeText={setMeasures}
          multiline
          maxLength={4000}
        />
        <DateField
          label="Next follow-up / visit date"
          value={next}
          onChange={(v) => {
            setNext(v);
            live.touch("next_follow_up_date");
          }}
          min={date || undefined}
          clearable
          error={errors.next_follow_up_date}
        />
      </FormCard>
    </FormScreen>
  );
}
