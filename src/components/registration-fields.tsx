import { Field, Select } from "@/components/ui";
import { OTHER } from "@/lib/participant-form";
import { woredasOf, zonesOf, type RegistrationAnswers, type RegistrationOptions } from "@/lib/public-registration";

/*
 * The fields the public registration and its status page share: zone and
 * woreda picked from Reference data, and the optional "about you" lists.
 */

/**
 * Zone from the region's list (typed when the region has none listed); woreda
 * from the zone's list plus "Other (type it)", because woreda coverage is
 * partial. Changing the zone clears the woreda.
 */
export function PlacePickers({
  options,
  region,
  zone,
  woreda,
  woredaOther,
  onZone,
  onWoreda,
  onWoredaOther,
}: {
  options: RegistrationOptions | undefined;
  region: string;
  zone: string;
  woreda: string;
  woredaOther: string;
  onZone: (zone: string) => void;
  onWoreda: (woreda: string) => void;
  onWoredaOther: (name: string) => void;
}) {
  const zones = zonesOf(options, region);
  const woredas = woredasOf(options, zone);
  return (
    <>
      {zones.length > 0 ? (
        <Select
          label="Zone"
          required
          value={zone || undefined}
          options={zones}
          onChange={onZone}
          placeholder={region ? "Select zone" : "Select the region first"}
          disabled={!region}
        />
      ) : (
        <Field
          label="Zone"
          required
          value={zone}
          onChangeText={onZone}
          autoCapitalize="words"
          hint={region ? "No zones listed for this region yet: type it." : undefined}
        />
      )}
      {woredas.length > 0 ? (
        <>
          <Select
            label="Woreda"
            required
            value={woreda || undefined}
            options={[...woredas, { label: "Other (type it)", value: OTHER }]}
            onChange={onWoreda}
            placeholder="Select woreda"
          />
          {woreda === OTHER ? (
            <Field label="Woreda name" required value={woredaOther} onChangeText={onWoredaOther} autoCapitalize="words" />
          ) : null}
        </>
      ) : (
        <Field label="Woreda" required value={woredaOther} onChangeText={onWoredaOther} autoCapitalize="words" />
      )}
    </>
  );
}

/** Education, marital status and vulnerability: optional; the officer confirms them at review. */
export function AnswerPickers({
  options,
  value,
  onChange,
}: {
  options: RegistrationOptions | undefined;
  value: RegistrationAnswers;
  onChange: (value: RegistrationAnswers) => void;
}) {
  const list = (rows: { code: string; label: string }[] | undefined) =>
    (rows ?? []).map((r) => ({ label: r.label, value: r.code }));
  return (
    <>
      <Select
        label="Education"
        value={value.education_level || undefined}
        options={list(options?.education_levels)}
        onChange={(v) => onChange({ ...value, education_level: v })}
        placeholder="Select (optional)"
      />
      <Select
        label="Marital status"
        value={value.marital_status || undefined}
        options={list(options?.marital_statuses)}
        onChange={(v) => onChange({ ...value, marital_status: v })}
        placeholder="Select (optional)"
      />
      <Select
        label="Does any of these apply to you?"
        value={value.vulnerability_category || undefined}
        options={list(options?.vulnerability_categories)}
        onChange={(v) => onChange({ ...value, vulnerability_category: v })}
        placeholder="Select (optional)"
      />
    </>
  );
}
