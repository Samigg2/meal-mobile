import { useRef, useState } from "react";
import { type ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ACTIVITY_STATUS, listActivities, type ActivityRow, type ProgressInput } from "@/lib/data";
import type { Targeted } from "@/lib/queue";
import { todayISO } from "@/lib/participant-form";
import { errorsFrom, fixCount, numberOf, saveOrQueue, useQueuedPayload, type Errors } from "@/lib/field-form";
import { FormCard, FormScreen, SavedNotice } from "@/components/field-form";
import { DateField } from "@/components/date-picker";
import { EmptyState, Field, Loading, Select, Text } from "@/components/ui";

/** A progress update waits with its activity (`_target`) and that activity's title. */
type QueuedProgress = Targeted<ProgressInput & { _title?: string }>;

const STATUSES = (Object.keys(ACTIVITY_STATUS) as ActivityRow["status"][]).map((value) => ({
  label: ACTIVITY_STATUS[value].label,
  value,
}));

/**
 * Progress on one work-plan activity, the same rules as the web: not started
 * is 0%, in progress 1–99%, completed 100%. A completed activity is verified
 * on the web by someone else; once verified the phone leaves it alone.
 */
export default function UpdateProgress() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queued = useQueuedPayload<QueuedProgress>();
  const activityId = queued.payload?._target ?? id;
  const { data, isLoading } = useQuery({ queryKey: ["activities"], queryFn: listActivities });

  if (!queued.ready || isLoading) return <Loading />;
  const activity = data?.find((a) => a.id === activityId);
  if (!activity) {
    return <EmptyState title="Activity not found" message="Connect once, or use Download for offline on the Sync screen." />;
  }
  if (activity.completion_review === "approved") {
    return (
      <EmptyState
        title="Verified as completed"
        message="This activity is verified and counted. Ask M&E to reopen it on the web if something is wrong."
      />
    );
  }
  return <ProgressForm activity={activity} initial={queued.payload} queuedId={queued.queuedId} />;
}

function ProgressForm({
  activity,
  initial,
  queuedId,
}: {
  activity: ActivityRow;
  initial: QueuedProgress | null;
  queuedId?: string;
}) {
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const [status, setStatus] = useState<ActivityRow["status"]>(initial?.status ?? activity.status);
  const [percent, setPercent] = useState(String(initial?.progress_percent ?? activity.progress_percent));
  const [started, setStarted] = useState(initial?.actual_start ?? activity.actual_start?.slice(0, 10) ?? "");
  const [ended, setEnded] = useState(initial?.actual_end ?? activity.actual_end?.slice(0, 10) ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);

  function pickStatus(next: ActivityRow["status"]) {
    setStatus(next);
    if (next === "not_started") setPercent("0");
    if (next === "completed") setPercent("100");
    setErrors({});
  }

  async function handleSave() {
    const found: Errors = {};
    const value = numberOf(percent);
    if (value === undefined || !Number.isInteger(value) || value < 0 || value > 100) found.progress_percent = "Give a whole number from 0 to 100";
    else if (status === "not_started" && value !== 0) found.progress_percent = "An activity that has not started is at 0%";
    else if (status === "in_progress" && (value < 1 || value > 99)) {
      found.progress_percent = "In progress is between 1% and 99%; mark it completed for 100%";
    }
    if (started && ended && ended < started) found.actual_end = "The end cannot be before the start";
    if (Object.keys(found).length) {
      setErrors({ ...found, form: fixCount(found) });
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const payload: QueuedProgress = {
      progress_percent: status === "completed" ? 100 : value!,
      status,
      actual_start: started || undefined,
      actual_end: ended || undefined,
      _target: activity.id,
      _title: activity.title,
    };
    setSaving(true);
    setErrors({});
    try {
      const result = await saveOrQueue({
        kind: "activity_progress",
        label: `Progress — ${activity.title}: ${ACTIVITY_STATUS[status].label}, ${payload.progress_percent}%`,
        payload,
        queuedId,
      });
      if (result === "sent") await queryClient.invalidateQueries({ queryKey: ["activities"] });
      setDone(result);
    } catch (err) {
      setErrors(errorsFrom(err, "Could not save the progress"));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  if (done) return <SavedNotice queued={done === "queued"} what="progress" another={false} />;

  return (
    <FormScreen ref={scroll} error={errors.form} saveTitle="Save progress" saving={saving} onSave={handleSave}>
      <FormCard title={activity.title} hint={activity.indicators ? `For ${activity.indicators.code} ${activity.indicators.name}` : undefined}>
        {activity.completion_review === "rejected" ? (
          <Text>Sent back after it was marked completed: finish it and mark it completed again.</Text>
        ) : null}
        <Select label="Status" required value={status} options={STATUSES} onChange={pickStatus} />
        <Field
          label="Progress (%)"
          required
          value={percent}
          onChangeText={setPercent}
          keyboardType="number-pad"
          editable={status === "in_progress" || status === "cancelled"}
          error={errors.progress_percent}
        />
        <DateField label="Actually started" value={started} onChange={setStarted} max={todayISO()} hint="Filled with today when left empty." />
        <DateField label="Actually ended" value={ended} onChange={setEnded} max={todayISO()} error={errors.actual_end} />
      </FormCard>
    </FormScreen>
  );
}
