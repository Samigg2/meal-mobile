import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSurvey, submitSurveyResponse, type SurveyResponseInput } from "@/lib/data";
import { enqueue, shouldQueue } from "@/lib/queue";
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
import { ApiError } from "@/lib/api";
import { useLocations, type Option } from "@/lib/reference";
import { colors, spacing } from "@/theme";
import type { SurveyQuestionRow } from "@/lib/types";

type AnswerValue = { text?: string; number?: string; options?: string[] };

/** A device-made id, so the server recognises a replayed offline submission. */
function makeRef(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
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

/**
 * Survey response capture. Answers are validated against the question spec and,
 * when the device is offline, the whole response is queued on the device.
 */
export default function CollectResponse() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["survey", id],
    queryFn: () => getSurvey(id),
    enabled: !!id,
  });

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [respondent, setRespondent] = useState("");
  const [sex, setSex] = useState<"male" | "female" | undefined>();
  const [isYouth, setIsYouth] = useState(false);
  const [disability, setDisability] = useState(false);
  const [region, setRegion] = useState("");
  const [zone, setZone] = useState("");
  const [woreda, setWoreda] = useState("");
  // Reference lists cached on the device, so the location is picked, not typed,
  // even offline. Called before any early return (rules of hooks).
  const locations = useLocations();
  const zoneOptions: Option[] = locations.zonesOf(region);
  const woredaOptions: Option[] = locations.woredasOf(zone);
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Kept for the life of this screen, so a retry sends the same reference.
  const [clientRef] = useState(makeRef);

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

  function buildPayload(): SurveyResponseInput | null {
    if (!sex) {
      setFormError("Sex is required.");
      return null;
    }
    if (!region.trim()) {
      setFormError("Region is required.");
      return null;
    }
    const collected: SurveyResponseInput["answers"] = [];
    for (const question of questions) {
      const value = answers[question.id] ?? {};
      const numeric = value.number !== undefined && value.number !== "" ? Number(value.number) : undefined;
      const hasValue =
        (value.text ?? "") !== "" || numeric !== undefined || (value.options?.length ?? 0) > 0;

      if (question.is_required && !hasValue) {
        setFormError(`"${question.label}" is required.`);
        return null;
      }
      if (numeric !== undefined && Number.isNaN(numeric)) {
        setFormError(`"${question.label}" must be a number.`);
        return null;
      }
      if (numeric !== undefined && question.min_value !== null && numeric < Number(question.min_value)) {
        setFormError(`"${question.label}" must be at least ${question.min_value}.`);
        return null;
      }
      if (numeric !== undefined && question.max_value !== null && numeric > Number(question.max_value)) {
        setFormError(`"${question.label}" must be at most ${question.max_value}.`);
        return null;
      }
      if (!hasValue) continue;

      collected.push({
        question_id: question.id,
        value_text: value.text || undefined,
        value_number: numeric,
        value_options: value.options ?? [],
      });
    }

    return {
      template_id: template.id,
      client_ref: clientRef,
      respondent_name: respondent || undefined,
      respondent_sex: sex,
      is_youth: isYouth,
      disability,
      region: region.trim(),
      zone: zone || undefined,
      woreda: woreda || undefined,
      collected_on: new Date().toISOString().slice(0, 10),
      enumerator: profile?.full_name || profile?.email || undefined,
      status: "submitted",
      notes: notes || undefined,
      answers: collected,
    };
  }

  async function handleSubmit() {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      await submitSurveyResponse(payload);
      await queryClient.invalidateQueries({ queryKey: ["surveys"] });
      router.back();
    } catch (err) {
      if (shouldQueue(err)) {
        await enqueue({
          kind: "survey_response",
          label: `${template.title} — ${respondent || "anonymous respondent"}`,
          payload,
        });
        setNotice("You are offline: this response is saved on the device and will upload when you sync.");
      } else {
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
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Text style={styles.title}>{template.title}</Text>
          <Text style={styles.meta}>
            {template.survey_round} round{template.theme ? ` · ${template.theme}` : ""}
          </Text>
          {template.description ? <Text style={styles.description}>{template.description}</Text> : null}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Respondent</Text>
          <Field label="Name (optional)" value={respondent} onChangeText={setRespondent} autoCapitalize="words" />
          <ChoiceRow
            label="Sex *"
            value={sex}
            options={[
              { label: "Male", value: "male" },
              { label: "Female", value: "female" },
            ]}
            onChange={setSex}
          />
          <Toggle label="Youth (15–35)" value={isYouth} onChange={setIsYouth} />
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
            }}
            placeholder="Select region"
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
                  placeholder={question.question_type === "scale" ? "1–5" : "Enter a number"}
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
                />
              ) : question.question_type === "single_choice" || question.question_type === "multi_choice" ? (
                <View style={styles.optionList}>
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
                </View>
              ) : (
                <Field
                  label=""
                  value={answers[question.id]?.text ?? ""}
                  onChangeText={(v) => setAnswer(question.id, { text: v })}
                  placeholder={question.question_type === "date" ? "YYYY-MM-DD" : "Answer"}
                  multiline={question.question_type === "text"}
                />
              )}
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <Field label="Enumerator notes" value={notes} onChangeText={setNotes} multiline />
        </Card>

        <ErrorText>{formError}</ErrorText>
      </ScrollView>
      <StickyFooter>
        <Button title="Submit response" onPress={handleSubmit} loading={saving} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { gap: spacing.md },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.muted, textTransform: "capitalize" },
  description: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  question: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  questionLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
  help: { fontSize: 12, color: colors.muted },
  optionList: { gap: 0 },
  noticeWrap: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.background },
  notice: { gap: spacing.md },
  noticeTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  noticeText: { fontSize: 13, color: colors.muted, lineHeight: 19 },
});
