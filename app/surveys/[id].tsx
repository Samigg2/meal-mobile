import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { Crosshair, MapPin, X } from "lucide-react-native";
import { getSurvey, listMyResponses, listSurveys, type MyResponse, type SurveyResponseInput } from "@/lib/data";
import { todayISO } from "@/lib/participant-form";
import { type Targeted } from "@/lib/queue";
import { makeRef, saveOrQueue, useQueuedPayload } from "@/lib/field-form";
import { useAuth } from "@/lib/auth";
import {
  Button,
  Card,
  ChoiceRow,
  EmptyState,
  ErrorText,
  Field,
  Loading,
  Select,
  StickyFooter,
  Text,
  Toggle,
} from "@/components/ui";
import { DateField } from "@/components/date-picker";
import { ApiError } from "@/lib/api";
import { useLocations, useLookupOptions, type Option, useSettings } from "@/lib/reference";
import { colors, spacing } from "@/theme";
import type { SurveyQuestionRow } from "@/lib/types";

type AnswerValue = { text?: string; number?: string; options?: string[] };

/** A form filled before: one waiting on the phone, or one already sent and being corrected. */
type Initial = Partial<SurveyResponseInput> & { _target?: string };

/** The answers as the form holds them, from what was sent. */
function toAnswerValues(answers: SurveyResponseInput["answers"] | undefined): Record<string, AnswerValue> {
  const values: Record<string, AnswerValue> = {};
  for (const a of answers ?? []) {
    values[a.question_id] = {
      text: a.value_text ?? undefined,
      number: a.value_number !== undefined && a.value_number !== null ? String(a.value_number) : undefined,
      options: a.value_options?.length ? a.value_options : undefined,
    };
  }
  return values;
}

/** A sent response as the form's starting point, to correct it. */
function fromSent(r: MyResponse): Initial {
  return {
    _target: r.id,
    client_ref: r.client_ref ?? undefined,
    respondent_name: r.respondent_name ?? undefined,
    respondent_sex: r.respondent_sex ?? undefined,
    age_group: r.age_group ?? undefined,
    is_youth: r.is_youth,
    disability: r.disability,
    region: r.region ?? undefined,
    zone: r.zone ?? undefined,
    woreda: r.woreda ?? undefined,
    kebele: r.kebele ?? undefined,
    collected_on: r.collected_on.slice(0, 10),
    notes: r.notes ?? undefined,
    latitude: r.latitude ?? undefined,
    longitude: r.longitude ?? undefined,
    gps_accuracy_m: r.gps_accuracy_m ?? undefined,
    answers: r.answers.map((a) => ({
      question_id: a.question_id,
      value_text: a.value_text ?? undefined,
      value_number: a.value_number ?? undefined,
      value_options: a.value_options,
    })),
  };
}

/**
 * Skip logic, matching the server: a question with a condition is asked only
 * when the question it points at was asked and given that answer.
 */
function visibleQuestionIds(questions: SurveyQuestionRow[], answers: Record<string, AnswerValue>): Set<string> {
  const byCode = new Map(questions.map((q) => [q.code.toLowerCase(), q]));
  const memo = new Map<string, boolean>();
  const words = (q: SurveyQuestionRow): string[] => {
    const a = answers[q.id];
    if (!a) return [];
    if (a.options?.length) return a.options.map((o) => o.toLowerCase());
    if (a.number) return [a.number];
    return a.text ? [a.text.trim().toLowerCase()] : [];
  };
  const asked = (q: SurveyQuestionRow): boolean => {
    if (memo.has(q.id)) return memo.get(q.id)!;
    let result = true;
    if (q.show_if_code) {
      const parent = byCode.get(q.show_if_code.toLowerCase());
      result = !!parent && asked(parent) && words(parent).includes((q.show_if_value ?? "").toLowerCase());
    }
    memo.set(q.id, result);
    return result;
  };
  return new Set(questions.filter(asked).map((q) => q.id));
}

/** The admin-editable age groups, as on the web respond page. */
const AGE_GROUP_LOOKUP = "survey_responses.age_group";

/** Why a collection day falls outside the survey's dates (the server's own check), or null. */
function outsideWindow(day: string, start: string | null, end: string | null): string | null {
  if (start && day < start.slice(0, 10)) return `The survey started on ${start.slice(0, 10)}; pick a date from then`;
  if (end && day > end.slice(0, 10)) return `The survey ended on ${end.slice(0, 10)}; pick a date up to then`;
  return null;
}

/** "1–5" for a question with its own bounds; a plain prompt otherwise. */
function numberHint(q: SurveyQuestionRow): string {
  const min = q.min_value !== null ? Number(q.min_value) : null;
  const max = q.max_value !== null ? Number(q.max_value) : null;
  if (min !== null && max !== null) return `${min}–${max}`;
  if (min !== null) return `At least ${min}`;
  if (max !== null) return `Up to ${max}`;
  return "Enter a number";
}

/**
 * Survey response capture. Answers are validated against the question spec and,
 * when the device is offline, the whole response is queued on the device. The
 * same form opens a waiting response again (`?queued=`) or corrects one already
 * sent (`?response=`): the collector's own, until it is verified.
 */
export default function CollectResponse() {
  const { id, response } = useLocalSearchParams<{ id: string; response?: string }>();
  const { user } = useAuth();
  const queued = useQueuedPayload<Initial>();
  const sent = useQuery({
    queryKey: ["my-responses", id],
    queryFn: () => listMyResponses(id, user?.id ?? ""),
    enabled: !!response && !!user,
  });

  if (!queued.ready || (response && sent.isLoading)) return <Loading />;
  if (response) {
    const found = sent.data?.find((r) => r.id === response);
    if (!found) {
      return (
        <EmptyState
          title="Could not open this response"
          message={sent.error instanceof Error ? sent.error.message : "Changing a sent response needs a connection."}
        />
      );
    }
    return <ResponseForm initial={fromSent(found)} />;
  }
  return <ResponseForm initial={queued.payload ?? {}} queuedId={queued.queuedId} />;
}

function ResponseForm({ initial, queuedId }: { initial: Initial; queuedId?: string }) {
  const settings = useSettings();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const scroll = useRef<ScrollView>(null);
  // A response already on the server is changed in place, not sent again.
  const editId = initial._target;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["survey", id],
    queryFn: () => getSurvey(id),
    enabled: !!id,
  });

  // The list entry carries the evaluation this survey collects for (0089).
  const { data: list } = useQuery({ queryKey: ["surveys"], queryFn: listSurveys, enabled: !!id });
  const evaluation = list?.find((s) => s.id === id)?.evaluation_title ?? null;

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => toAnswerValues(initial.answers));
  const [respondent, setRespondent] = useState(initial.respondent_name ?? "");
  const [sex, setSex] = useState<"male" | "female" | undefined>(initial.respondent_sex);
  const [ageGroup, setAgeGroup] = useState(initial.age_group ?? "");
  const [isYouth, setIsYouth] = useState(initial.is_youth ?? false);
  const [disability, setDisability] = useState(initial.disability ?? false);
  const [region, setRegion] = useState(initial.region ?? "");
  const [zone, setZone] = useState(initial.zone ?? "");
  const [woreda, setWoreda] = useState(initial.woreda ?? "");
  const [kebele, setKebele] = useState(initial.kebele ?? "");
  // The day the answers were collected, which a later sync must keep (the
  // survey's date window is checked against it, not against the upload day).
  const [collectedOn, setCollectedOn] = useState(initial.collected_on ?? todayISO());
  const ageGroups = useLookupOptions(AGE_GROUP_LOOKUP);
  // Reference lists cached on the device, so the location is picked, not typed,
  // even offline. Called before any early return (rules of hooks).
  const locations = useLocations();
  const zoneOptions: Option[] = locations.zonesOf(region);
  const woredaOptions: Option[] = locations.woredasOf(zone);
  const [notes, setNotes] = useState(initial.notes ?? "");
  // One message under each field that needs fixing, keyed by field or question id.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Kept for the life of this screen (and a corrected waiting copy), so a retry sends the same reference.
  const [clientRef] = useState(() => initial.client_ref ?? makeRef());
  const [gps, setGps] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(
    initial.latitude !== undefined && initial.longitude !== undefined
      ? { latitude: initial.latitude, longitude: initial.longitude, accuracy: initial.gps_accuracy_m ?? 0 }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  async function captureGps() {
    setLocating(true);
    setGpsError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setGpsError("Location permission was refused.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setGps({
        latitude: Number(pos.coords.latitude.toFixed(6)),
        longitude: Number(pos.coords.longitude.toFixed(6)),
        accuracy: Math.round(pos.coords.accuracy ?? 0),
      });
    } catch {
      setGpsError("Could not get a GPS fix. Try again in the open.");
    } finally {
      setLocating(false);
    }
  }

  if (isLoading) return <Loading />;
  if (isError || !data) {
    return (
      <EmptyState
        title="Could not load the survey"
        message={error instanceof Error ? error.message : "Check your connection and try again."}
      />
    );
  }

  const { template, questions: allQuestions } = data;

  if (template.status !== "active") {
    return (
      <EmptyState
        title="This survey is not collecting responses"
        message={`It is ${template.status}. Ask your monitoring officer to reopen it if data collection should continue.`}
      />
    );
  }
  const visible = visibleQuestionIds(allQuestions, answers);
  const questions = allQuestions.filter((q) => visible.has(q.id));

  function setAnswer(questionId: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], ...value } }));
    clearError(questionId);
  }

  function clearError(key: string) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFormError(null);
  }

  function toggleOption(question: SurveyQuestionRow, option: string) {
    const current = answers[question.id]?.options ?? [];
    const next =
      question.question_type === "multi_choice"
        ? current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option]
        : [option];
    setAnswer(question.id, { options: next });
  }

  /** Every problem at once, each under its own field, as on the web form. */
  function buildPayload(): SurveyResponseInput | null {
    const found: Record<string, string> = {};
    if (!sex) found.sex = "Sex is required";
    if (!region.trim()) found.region = "Region is required";
    const windowProblem = outsideWindow(collectedOn, template.start_date, template.end_date);
    if (!collectedOn) found.collected_on = "The collection date is required";
    else if (collectedOn > todayISO()) found.collected_on = "The collection date cannot be in the future";
    else if (windowProblem) found.collected_on = windowProblem;

    const collected: SurveyResponseInput["answers"] = [];
    for (const question of questions) {
      const value = answers[question.id] ?? {};
      const numeric = value.number !== undefined && value.number !== "" ? Number(value.number) : undefined;
      const hasValue =
        (value.text ?? "") !== "" || numeric !== undefined || (value.options?.length ?? 0) > 0;

      if (question.is_required && !hasValue) found[question.id] = "This question is required";
      else if (numeric !== undefined && Number.isNaN(numeric)) found[question.id] = "Enter a number";
      else if (numeric !== undefined && question.min_value !== null && numeric < Number(question.min_value)) {
        found[question.id] = `Must be at least ${question.min_value}`;
      } else if (numeric !== undefined && question.max_value !== null && numeric > Number(question.max_value)) {
        found[question.id] = `Must be at most ${question.max_value}`;
      }
      if (!hasValue || found[question.id]) continue;

      collected.push({
        question_id: question.id,
        value_text: value.text || undefined,
        value_number: numeric,
        value_options: value.options ?? [],
      });
    }

    setErrors(found);
    const count = Object.keys(found).length;
    if (count > 0 || !sex) {
      setFormError(`${count} thing${count === 1 ? "" : "s"} to fix before submitting. Check the fields marked in red.`);
      scroll.current?.scrollTo({ y: 0, animated: true });
      return null;
    }

    return {
      template_id: template.id,
      client_ref: clientRef,
      respondent_name: respondent || undefined,
      respondent_sex: sex,
      age_group: ageGroup || undefined,
      is_youth: isYouth,
      disability,
      region: region.trim(),
      zone: zone || undefined,
      woreda: woreda || undefined,
      kebele: kebele.trim() || undefined,
      collected_on: collectedOn,
      enumerator: profile?.full_name || profile?.email || undefined,
      status: "submitted",
      notes: notes || undefined,
      latitude: gps?.latitude,
      longitude: gps?.longitude,
      gps_accuracy_m: gps?.accuracy,
      answers: collected,
    };
  }

  async function handleSubmit() {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      const result = await saveOrQueue({
        kind: editId ? "survey_edit" : "survey_response",
        label: `${template.title} — ${respondent || "anonymous respondent"}${editId ? " (change)" : ""}`,
        payload: editId ? ({ ...payload, _target: editId } satisfies Targeted<SurveyResponseInput>) : payload,
        queuedId,
      });
      if (result === "queued") {
        setNotice(
          "You are offline: this response is saved on the device and will upload when you sync. Open it from Sync to correct it until then.",
        );
      } else {
        await queryClient.invalidateQueries({ queryKey: ["surveys"] });
        await queryClient.invalidateQueries({ queryKey: ["my-responses", id] });
        router.back();
      }
    } catch (err) {
      {
        // Every problem the server found (a required answer, the survey window, a duplicate).
        setFormError(err instanceof ApiError ? err.problems.join("\n") : "Could not submit the response");
      }
    } finally {
      setSaving(false);
    }
  }

  if (notice) {
    return (
      <View style={styles.noticeWrap}>
        <Card style={styles.notice}>
          <Text style={styles.noticeTitle}>Saved on this device</Text>
          <Text style={styles.noticeText}>{notice}</Text>
          <Button title="Done" onPress={() => router.back()} />
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ErrorText>{formError}</ErrorText>
        <Card style={styles.card}>
          <Text style={styles.title}>{template.title}</Text>
          {evaluation ? <Text style={styles.evaluation}>For the evaluation: {evaluation}</Text> : null}
          <Text style={styles.meta}>
            {template.survey_round} round{template.theme ? ` · ${template.theme}` : ""}
            {template.start_date || template.end_date
              ? ` · ${template.start_date?.slice(0, 10) ?? "…"} to ${template.end_date?.slice(0, 10) ?? "…"}`
              : ""}
          </Text>
          {template.description ? <Text style={styles.description}>{template.description}</Text> : null}
          {editId ? (
            <Text style={styles.evaluation}>Changing a response you sent: it goes back for review.</Text>
          ) : queuedId ? null : (
            <Button
              title="My responses to this survey"
              variant="outline"
              onPress={() => router.push({ pathname: "/surveys/mine", params: { id: template.id } })}
            />
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Respondent</Text>
          <DateField
            label="Date collected"
            required
            value={collectedOn}
            onChange={(v) => {
              setCollectedOn(v);
              clearError("collected_on");
            }}
            min={template.start_date?.slice(0, 10) ?? undefined}
            max={
              template.end_date && template.end_date.slice(0, 10) < todayISO()
                ? template.end_date.slice(0, 10)
                : todayISO()
            }
            hint="The day the answers were given, even if they upload later."
            error={errors.collected_on}
          />
          <Field label="Name (optional)" value={respondent} onChangeText={setRespondent} autoCapitalize="words" />
          <ChoiceRow
            label="Sex"
            required
            value={sex}
            options={[
              { label: "Male", value: "male" },
              { label: "Female", value: "female" },
            ]}
            onChange={(v) => {
              setSex(v);
              clearError("sex");
            }}
            error={errors.sex}
          />
          {ageGroups.length > 0 ? (
            <Select
              label="Age group"
              value={ageGroup}
              options={ageGroups}
              onChange={setAgeGroup}
              placeholder="Select age group"
            />
          ) : null}
          <Toggle label={`Youth (${settings.youth_min_age}–${settings.youth_max_age})`} value={isYouth} onChange={setIsYouth} />
          <Toggle label="Has a disability" value={disability} onChange={setDisability} />
          <Select
            label="Region"
            required
            value={region}
            options={locations.regions}
            onChange={(v) => {
              setRegion(v);
              setZone("");
              setWoreda("");
              clearError("region");
            }}
            placeholder="Select region"
            error={errors.region}
          />
          {zoneOptions.length > 0 ? (
            <Select
              label="Zone"
              value={zone}
              options={zoneOptions}
              onChange={(v) => {
                setZone(v);
                setWoreda("");
              }}
              placeholder={region ? "Select zone" : "Select the region first"}
              disabled={!region}
            />
          ) : (
            <Field label="Zone" value={zone} onChangeText={setZone} autoCapitalize="words" />
          )}
          {woredaOptions.length > 0 ? (
            <Select
              label="Woreda"
              value={woreda}
              options={woredaOptions}
              onChange={setWoreda}
              placeholder="Select woreda"
            />
          ) : (
            <Field label="Woreda" value={woreda} onChangeText={setWoreda} autoCapitalize="words" />
          )}
          <Field label="Kebele" value={kebele} onChangeText={setKebele} autoCapitalize="words" />

          <View style={styles.gpsRow}>
            <MapPin size={16} color={colors.muted} />
            <View style={styles.gpsTextWrap}>
              {gps ? (
                <Text style={styles.gpsText}>
                  {gps.latitude}, {gps.longitude}
                  <Text style={[styles.gpsAccuracy, gps.accuracy > 100 && styles.gpsAccuracyWeak]}>
                    {"  "}±{gps.accuracy} m{gps.accuracy > 100 ? " (weak fix, retry in the open)" : ""}
                  </Text>
                </Text>
              ) : (
                <Text style={styles.gpsPlaceholder}>No GPS point captured for this response.</Text>
              )}
            </View>
            {gps ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear GPS point" onPress={() => setGps(null)}>
                <X size={16} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          <Button
            title={gps ? "Recapture GPS" : "Capture GPS"}
            icon={Crosshair}
            variant="outline"
            onPress={captureGps}
            loading={locating}
          />
          <ErrorText>{gpsError}</ErrorText>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Questions</Text>
          {questions.map((question) => (
            <View key={question.id} style={styles.question}>
              <Text style={styles.questionLabel}>
                {question.label}
                {question.is_required ? " *" : ""}
              </Text>
              {question.help_text ? <Text style={styles.help}>{question.help_text}</Text> : null}

              {question.question_type === "number" || question.question_type === "scale" ? (
                <Field
                  label=""
                  value={answers[question.id]?.number ?? ""}
                  onChangeText={(v) => setAnswer(question.id, { number: v })}
                  keyboardType="numeric"
                  placeholder={numberHint(question)}
                  error={errors[question.id]}
                />
              ) : question.question_type === "yes_no" ? (
                <ChoiceRow
                  label=""
                  value={answers[question.id]?.options?.[0]}
                  options={[
                    { label: "Yes", value: "yes" },
                    { label: "No", value: "no" },
                  ]}
                  onChange={(v) => setAnswer(question.id, { options: [v] })}
                  error={errors[question.id]}
                />
              ) : question.question_type === "single_choice" ? (
                // One answer: the same pick-one chips as Sex and Yes/No.
                <ChoiceRow
                  label=""
                  value={answers[question.id]?.options?.[0]}
                  options={question.options.map((option) => ({ label: option, value: option }))}
                  onChange={(v) => setAnswer(question.id, { options: [v] })}
                  error={errors[question.id]}
                />
              ) : question.question_type === "multi_choice" ? (
                <View style={styles.optionList}>
                  <Text style={styles.help}>Tick all that apply.</Text>
                  {question.options.map((option) => {
                    const selected = (answers[question.id]?.options ?? []).includes(option);
                    return (
                      <Toggle
                        key={option}
                        label={option}
                        value={selected}
                        onChange={() => toggleOption(question, option)}
                      />
                    );
                  })}
                  {errors[question.id] ? <Text style={styles.fieldError}>{errors[question.id]}</Text> : null}
                </View>
              ) : question.question_type === "date" ? (
                <DateField
                  label=""
                  value={answers[question.id]?.text ?? ""}
                  onChange={(v) => setAnswer(question.id, { text: v })}
                  error={errors[question.id]}
                />
              ) : (
                <Field
                  label=""
                  value={answers[question.id]?.text ?? ""}
                  onChangeText={(v) => setAnswer(question.id, { text: v })}
                  placeholder="Answer"
                  multiline={question.question_type === "text"}
                  error={errors[question.id]}
                />
              )}
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <Field label="Enumerator notes" value={notes} onChangeText={setNotes} multiline />
        </Card>
      </ScrollView>
      <StickyFooter>
        <Button title={editId ? "Save changes" : "Submit response"} onPress={handleSubmit} loading={saving} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { gap: spacing.md },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.muted },
  evaluation: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  fieldError: { fontSize: 12, color: colors.danger, fontWeight: "500" },
  description: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  question: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  questionLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
  help: { fontSize: 12, color: colors.muted },
  optionList: { gap: 0 },
  gpsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
  },
  gpsTextWrap: { flex: 1 },
  gpsText: { fontSize: 13, color: colors.text },
  gpsAccuracy: { fontSize: 12, color: colors.muted },
  gpsAccuracyWeak: { color: colors.warning },
  gpsPlaceholder: { fontSize: 13, color: colors.muted },
  noticeWrap: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.background },
  notice: { gap: spacing.md },
  noticeTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  noticeText: { fontSize: 13, color: colors.muted, lineHeight: 19 },
});
