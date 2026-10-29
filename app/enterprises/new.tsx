import { useRef, useState } from "react";
import { type ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { getEnterprise, type EnterpriseInput } from "@/lib/data";
import type { EnterpriseRow } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { PHONE_RE, todayISO } from "@/lib/participant-form";
import { useLookupOptions } from "@/lib/reference";
import {
  changedValues,
  errorsFrom,
  makeRef,
  numberOf,
  saveOrQueue,
  useEditRecord,
  useLiveErrors,
  useQueuedPayload,
  type EditPayload,
  type Errors,
} from "@/lib/field-form";
import {
  FormCard,
  FormScreen,
  FormStep,
  GpsField,
  PlaceFields,
  SavedNotice,
  type GpsPoint,
} from "@/components/field-form";
import { DateField } from "@/components/date-picker";
import { Button, EmptyState, Field, Loading, Select } from "@/components/ui";

const TIN_RE = /^\d{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUSES = [
  { label: "Active", value: "active" },
  { label: "Not active", value: "inactive" },
];

/** A new enterprise waits with its owner's name, for the Sync screen and to open it again. */
type QueuedEnterprise = EnterpriseInput & { _owner_name?: string };

/**
 * Profile a participant's business on the spot, with its GPS point. It is
 * approved on the web by someone else (four-eyes). The same owner with a
 * business of the same name is asked about first: two real businesses are
 * two records, the same one twice is not.
 */
export default function NewEnterprise() {
  const { owner, ownerName } = useLocalSearchParams<{
    owner?: string;
    ownerName?: string;
  }>();
  const edit = useEditRecord<EnterpriseRow>(getEnterprise, "enterprise");
  const queued = useQueuedPayload<QueuedEnterprise>();
  if (!queued.ready || !edit.ready) return <Loading />;
  // Opened with `edit`: the same form, filled in from the enterprise, saving a change.
  if (edit.editing) {
    if (!edit.row)
      return (
        <EmptyState
          title="Could not load the enterprise"
          message={edit.loadError ?? "Try again."}
        />
      );
    const row = edit.row;
    return (
      <EnterpriseForm
        initial={rowToInitial(row)}
        owner={row.owner_participant_id ?? ""}
        ownerName={row.owner_name ?? ""}
        queuedId={edit.queuedId}
        change={{ id: edit.id!, before: edit.before! }}
      />
    );
  }
  const initial = queued.payload;
  return (
    <EnterpriseForm
      initial={initial}
      owner={initial?.owner_participant_id ?? owner ?? ""}
      ownerName={initial?._owner_name ?? ownerName ?? ""}
      queuedId={queued.queuedId}
    />
  );
}

/** The enterprise as the form's own shape, so one form serves add and change. */
function rowToInitial(
  r: EnterpriseRow & { latitude?: number | null; longitude?: number | null },
): QueuedEnterprise {
  return {
    enterprise_name: r.enterprise_name,
    owner_participant_id: r.owner_participant_id ?? "",
    enterprise_type: r.enterprise_type ?? "",
    region: r.region ?? "",
    zone: r.zone ?? "",
    woreda: r.woreda ?? "",
    kebele: r.kebele ?? undefined,
    phone: r.phone ?? "",
    email: r.email ?? undefined,
    status: r.status as EnterpriseInput["status"],
    registration_status: r.registration_status ?? "",
    tin_number: r.tin_number ?? undefined,
    established_date: (r.established_date ?? "").slice(0, 10),
    employees_male: Number(r.employees_male ?? 0),
    employees_female: Number(r.employees_female ?? 0),
    latitude: r.latitude != null ? Number(r.latitude) : undefined,
    longitude: r.longitude != null ? Number(r.longitude) : undefined,
    client_ref: "",
  };
}

function EnterpriseForm({
  initial,
  owner,
  ownerName,
  queuedId,
  change,
}: {
  initial: QueuedEnterprise | null;
  owner: string;
  ownerName: string;
  queuedId?: string;
  /** Set when this is a change to an existing enterprise (the id, and the record as it was). */
  change?: { id: string; before: EnterpriseRow };
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const scroll = useRef<ScrollView>(null);
  const sectors = useLookupOptions("enterprise.sector");
  const statuses = useLookupOptions("enterprises.registration_status");
  const [name, setName] = useState(initial?.enterprise_name ?? "");
  const [type, setType] = useState(initial?.enterprise_type ?? "");
  const [place, setPlace] = useState({
    region: initial?.region ?? "",
    zone: initial?.zone ?? "",
    woreda: initial?.woreda ?? "",
  });
  const [kebele, setKebele] = useState(initial?.kebele ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [status, setStatus] = useState<string>(initial?.status ?? "active");
  const [registration, setRegistration] = useState(
    initial?.registration_status ?? "",
  );
  const [tin, setTin] = useState(initial?.tin_number ?? "");
  const [established, setEstablished] = useState(
    initial?.established_date ?? "",
  );
  const [men, setMen] = useState(initial ? String(initial.employees_male) : "");
  const [women, setWomen] = useState(
    initial ? String(initial.employees_female) : "",
  );
  const [gps, setGps] = useState<GpsPoint | null>(
    initial?.latitude !== undefined && initial?.longitude !== undefined
      ? {
          latitude: initial.latitude,
          longitude: initial.longitude,
          accuracy: 0,
        }
      : null,
  );
  const [clientRef] = useState(() => initial?.client_ref ?? makeRef());
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);

  const cleanPhone = phone.replace(/[\s-]/g, "");
  const male = numberOf(men);
  const female = numberOf(women);
  // The web's rules and words (enterprises.new.tsx), checked while filling and on Save.
  const live = useLiveErrors(() => {
    const found: Errors = {};
    if (!owner && !change)
      found.form = "Open this from the participant who owns the business.";
    if (!name.trim()) found.enterprise_name = "Enterprise name is required";
    if (!type) found.enterprise_type = "Sector is required";
    if (!place.region) found.region = "Region is required";
    if (!place.zone.trim()) found.zone = "Zone is required";
    if (!place.woreda.trim()) found.woreda = "Woreda is required";
    if (!PHONE_RE.test(cleanPhone))
      found.phone =
        "Enter an Ethiopian phone number, like 0912345678 or +251912345678";
    if (email.trim() && !EMAIL_RE.test(email.trim()))
      found.email = "Enter a valid email address";
    if (!registration)
      found.registration_status = "Registration status is required";
    if (registration === "registered" && !TIN_RE.test(tin.trim()))
      found.tin_number = "The TIN must be exactly 10 digits";
    if (!established) found.established_date = "Established date is required";
    else if (established > todayISO())
      found.established_date = "Established date cannot be in the future";
    for (const [key, value, label] of change
      ? []
      : ([
          ["employees_male", male, "Male employees"],
          ["employees_female", female, "Female employees"],
        ] as const)) {
      const text = key === "employees_male" ? men : women;
      if (text.trim() === "") found[key] = `${label} is required`;
      else if (value === undefined || !Number.isInteger(value) || value < 0)
        found[key] = `${label} must be a whole number`;
      else if (value > 10_000) found[key] = `${label} must be at most 10,000`;
    }
    return found;
  });
  const { errors } = live;

  async function handleSave(confirmDuplicate = false) {
    if (!live.submit()) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const payload: QueuedEnterprise = {
      enterprise_name: name.trim(),
      owner_participant_id: owner,
      enterprise_type: type,
      region: place.region,
      zone: place.zone.trim(),
      woreda: place.woreda.trim(),
      kebele: kebele.trim() || undefined,
      phone: cleanPhone,
      email: email.trim() || undefined,
      status: status as EnterpriseInput["status"],
      registration_status: registration,
      tin_number: registration === "registered" ? tin.trim() : undefined,
      established_date: established,
      employees_male: male!,
      employees_female: female!,
      latitude: gps?.latitude,
      longitude: gps?.longitude,
      confirm_duplicate: confirmDuplicate || undefined,
      client_ref: clientRef,
      _owner_name: ownerName || undefined,
    };
    setSaving(true);
    setDuplicate(null);
    try {
      if (change) {
        // Workers follow the latest verified visit and the status is changed on the web: neither is sent.
        const {
          client_ref: _ref,
          confirm_duplicate: _dup,
          _owner_name: _name,
          employees_male: _m,
          employees_female: _f,
          status: _s,
          ...now
        } = payload;
        const values = changedValues(
          rowToInitial(change.before),
          now as Partial<QueuedEnterprise>,
        );
        if (Object.keys(values).length === 0) {
          router.back();
          return;
        }
        const body: EditPayload<
          EnterpriseRow,
          { values: Record<string, unknown>; expected_updated_at?: string }
        > = {
          values,
          // As this form saw it: a change made since (while this waited offline) is refused, not overwritten.
          expected_updated_at: change.before.updated_at,
          _target: change.id,
          _before: change.before,
          _after: values as Partial<EnterpriseRow>,
        };
        const sent = await saveOrQueue({
          kind: "enterprise_edit",
          label: `Change to ${change.before.enterprise_name}`,
          payload: body,
          queuedId,
        });
        await queryClient.invalidateQueries({
          queryKey: ["enterprise", change.id],
        });
        await queryClient.invalidateQueries({ queryKey: ["enterprises"] });
        if (sent === "sent") router.back();
        else setDone("queued");
        return;
      }
      const result = await saveOrQueue({
        kind: "enterprise",
        label: `Enterprise — ${payload.enterprise_name}${ownerName ? ` (${ownerName})` : ""}`,
        payload,
        queuedId,
      });
      if (result === "sent")
        await queryClient.invalidateQueries({
          queryKey: ["participant-detail", owner],
        });
      setDone(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409)
        setDuplicate(err.message);
      live.setServer(errorsFrom(err, "Could not save the enterprise"));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  if (done)
    return (
      <SavedNotice
        queued={done === "queued"}
        what={change ? "change" : "enterprise"}
        another={!change}
      />
    );

  return (
    <FormScreen
      ref={scroll}
      error={errors.form}
      saveTitle={change ? "Save changes" : "Save the enterprise"}
      saving={saving}
      onSave={() => void handleSave()}
      steps={{
        titles: ["The business", "Workers & place"],
        fields: [
          [
            "enterprise_name",
            "enterprise_type",
            "established_date",
            "registration_status",
            "tin_number",
            "phone",
            "email",
          ],
          ["employees_male", "employees_female", "region", "zone", "woreda"],
        ],
        check: live.checkStep,
        errors,
      }}
    >
      {duplicate ? (
        <FormCard
          title="Already recorded?"
          hint={`${duplicate} If this is a second, different business, save it anyway.`}
        >
          <Button
            title="It is a different business: save anyway"
            variant="outline"
            onPress={() => void handleSave(true)}
          />
        </FormCard>
      ) : null}
      <FormStep index={0}>
        <FormCard
          title="The business"
          hint={ownerName ? `Owner: ${ownerName}` : undefined}
        >
          <Field
            label="Enterprise name"
            required
            value={name}
            onChangeText={setName}
            onBlur={() => live.touch("enterprise_name")}
            error={errors.enterprise_name}
          />
          <Select
            label="Sector"
            required
            value={type || undefined}
            options={sectors}
            onChange={(v) => {
              setType(v);
              live.touch("enterprise_type");
            }}
            placeholder="Select"
            error={errors.enterprise_type}
          />
          <DateField
            label="Established date"
            required
            value={established}
            onChange={(v) => {
              setEstablished(v);
              live.touch("established_date");
            }}
            max={todayISO()}
            error={errors.established_date}
          />
          <Select
            label="Registration status"
            required
            value={registration || undefined}
            options={statuses}
            onChange={(v) => {
              setRegistration(v);
              live.touch("registration_status");
            }}
            placeholder="Select status"
            error={errors.registration_status}
          />
          {registration === "registered" ? (
            <Field
              label="TIN Number"
              required
              value={tin}
              onChangeText={setTin}
              onBlur={() => live.touch("tin_number")}
              keyboardType="number-pad"
              maxLength={10}
              error={errors.tin_number}
            />
          ) : null}
          {change ? null : (
            <Select
              label="Status"
              value={status}
              options={STATUSES}
              onChange={setStatus}
            />
          )}
          <Field
            label="Phone"
            required
            value={phone}
            onChangeText={setPhone}
            onBlur={() => live.touch("phone")}
            keyboardType="phone-pad"
            error={errors.phone}
          />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            onBlur={() => live.touch("email")}
            keyboardType="email-address"
            error={errors.email}
          />
        </FormCard>
      </FormStep>
      <FormStep index={1}>
        {change ? null : (
          <FormCard
            title="Workers"
            hint="Everyone working in it now, the owner included."
          >
            <Field
              label="Male employees"
              required
              value={men}
              onChangeText={setMen}
              onBlur={() => live.touch("employees_male")}
              keyboardType="number-pad"
              error={errors.employees_male}
            />
            <Field
              label="Female employees"
              required
              value={women}
              onChangeText={setWomen}
              onBlur={() => live.touch("employees_female")}
              keyboardType="number-pad"
              error={errors.employees_female}
            />
          </FormCard>
        )}
        <FormCard title="Where">
          <PlaceFields
            value={place}
            onChange={setPlace}
            required
            errors={errors}
          />
          <Field
            label="Kebele"
            value={kebele}
            onChangeText={setKebele}
            autoCapitalize="words"
          />
          <GpsField value={gps} onChange={setGps} what="business" />
        </FormCard>
      </FormStep>
    </FormScreen>
  );
}
