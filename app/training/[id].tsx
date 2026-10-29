import { useRef, useState } from "react";
import { type ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTrainingDetail, type AttendanceInput, type TrainingDetail } from "@/lib/data";
import { todayISO } from "@/lib/participant-form";
import { errorsFrom, saveOrQueue, useLiveErrors, useQueuedPayload, type Errors } from "@/lib/field-form";
import { FormCard, FormScreen, SavedNotice } from "@/components/field-form";
import { DateField, formatDate } from "@/components/date-picker";
import { Button, EmptyState, Loading, SearchBar, Text, Toggle } from "@/components/ui";
import { colors, spacing } from "@/theme";

/**
 * Attendance for one training day: the roster, ticked present or left
 * unticked. Saving the same day again changes the ticks (the server adds who
 * is present and takes off who is not), so sending it twice is harmless.
 */
export default function TakeAttendance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queued = useQueuedPayload<AttendanceInput>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["training-detail", id],
    queryFn: () => getTrainingDetail(id),
    enabled: !!id,
  });

  if (!queued.ready || isLoading) return <Loading />;
  if (error || !data) {
    return (
      <EmptyState
        title="Could not load this training"
        message={error instanceof Error ? error.message : "Check your connection and try again."}
      />
    );
  }
  return <AttendanceForm detail={data} initial={queued.payload} queuedId={queued.queuedId} />;
}

/** Who is recorded present on a day, from the attendance the server has. */
const presentOn = (detail: TrainingDetail, day: string) =>
  new Set(detail.attendance.filter((a) => a.attendance_date.slice(0, 10) === day).map((a) => a.participant_id));

function AttendanceForm({
  detail,
  initial,
  queuedId,
}: {
  detail: TrainingDetail;
  initial: AttendanceInput | null;
  queuedId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const { event, roster } = detail;
  const start = event.start_date?.slice(0, 10) ?? undefined;
  const end = event.end_date?.slice(0, 10) ?? start;
  // Today when the training runs today; otherwise its first day.
  const firstDay = (() => {
    const today = todayISO();
    if (start && today < start) return start;
    if (end && today > end) return end;
    return today;
  })();
  const [day, setDay] = useState(initial?.attendance_date ?? firstDay);
  const [present, setPresent] = useState<Set<string>>(() =>
    initial ? new Set(initial.participant_ids) : presentOn(detail, firstDay),
  );
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);

  // The web's rule and words (training-attendance-panel.tsx), checked when the day is picked and on Save.
  const live = useLiveErrors(() => {
    const found: Errors = {};
    if (!day) found.attendance_date = "Session Date is required";
    else if (day > todayISO()) found.attendance_date = "Attendance cannot be taken for a day that has not come yet";
    else if ((start && day < start) || (end && day > end)) {
      found.attendance_date = `Pick a day within the training (${start} to ${end})`;
    }
    return found;
  });
  const { errors } = live;

  // Search only hides rows; the save below still sends everyone on the roster.
  const words = search.trim().toLowerCase();
  // A long roster (100+) shows a page of names at a time; search finds anyone.
  const [limit, setLimit] = useState(ROSTER_PAGE);
  const shown = roster.filter(
    (r) => !words || `${r.participants?.full_name ?? ""} ${r.participants?.participant_id ?? ""}`.toLowerCase().includes(words),
  );

  function pickDay(next: string) {
    setDay(next);
    setPresent(presentOn(detail, next));
    live.touch("attendance_date");
  }

  function toggle(participantId: string) {
    setPresent((prev) => {
      const next = new Set(prev);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  }

  async function handleSave() {
    if (!live.submit()) {
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const everyone = roster.map((r) => r.participant_id);
    const payload: AttendanceInput = {
      training_event_id: event.id,
      attendance_date: day,
      participant_ids: everyone.filter((p) => present.has(p)),
      absent_ids: everyone.filter((p) => !present.has(p)),
    };
    setSaving(true);
    try {
      const result = await saveOrQueue({
        kind: "training_attendance",
        label: `Attendance — ${event.title}, ${formatDate(day)} (${payload.participant_ids.length} present)`,
        payload,
        queuedId,
      });
      if (result === "sent") await queryClient.invalidateQueries({ queryKey: ["training-detail", event.id] });
      setDone(result);
    } catch (err) {
      live.setServer(errorsFrom(err, "Could not save the attendance"));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  if (done) return <SavedNotice queued={done === "queued"} what="attendance" />;

  if (roster.length === 0) {
    return (
      <EmptyState
        title="Nobody is enrolled"
        message="Enrol participants in this training on the web first; then their names appear here to tick."
        action={<Button title="Back" variant="outline" onPress={() => router.back()} />}
      />
    );
  }

  return (
    <FormScreen ref={scroll} error={errors.form} saveTitle={`Save attendance (${present.size} present)`} saving={saving} onSave={handleSave}>
      <FormCard title={event.title}>
        <DateField
          label="Session Date"
          required
          value={day}
          onChange={pickDay}
          min={start}
          max={end && end < todayISO() ? end : todayISO()}
          error={errors.attendance_date}
          hint="Ticks already saved for this day are shown; change them and save again."
        />
      </FormCard>
      <FormCard title="Who came" hint={`${present.size} of ${roster.length} ticked present.`}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name or ID" />
        <View style={styles.bulk}>
          <View style={styles.flex}>
            <Button title="All present" variant="outline" onPress={() => setPresent(new Set(roster.map((r) => r.participant_id)))} />
          </View>
          <View style={styles.flex}>
            <Button title="Clear" variant="outline" onPress={() => setPresent(new Set())} />
          </View>
        </View>
        {shown.slice(0, limit).map((r) => (
          <Toggle
            key={r.participant_id}
            label={`${r.participants?.full_name ?? "Unknown"}${r.participants?.participant_id ? ` · ${r.participants.participant_id}` : ""}`}
            value={present.has(r.participant_id)}
            onChange={() => toggle(r.participant_id)}
          />
        ))}
        {shown.length > limit ? (
          <Button
            title={`Show ${Math.min(ROSTER_PAGE, shown.length - limit)} more (${shown.length - limit} not shown)`}
            variant="outline"
            onPress={() => setLimit((n) => n + ROSTER_PAGE)}
          />
        ) : null}
        {shown.length === 0 ? <Text style={styles.meta}>No name matches.</Text> : null}
        <Text style={styles.meta}>
          Unticked names are recorded as absent for this day. Searching only hides names: everyone ticked is still saved.
        </Text>
      </FormCard>
    </FormScreen>
  );
}

/** Names shown at a time on the attendance roster. */
const ROSTER_PAGE = 40;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bulk: { flexDirection: "row", gap: spacing.sm },
  meta: { fontSize: 12, color: colors.muted },
});
