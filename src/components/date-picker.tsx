import { useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui";
import { colors, radius, spacing, TOUCH } from "@/theme";

/**
 * A calendar date field, drawn in JavaScript so it looks the same on Android
 * and iOS and needs no native module. The header opens a year list, so a date
 * of birth twenty years back is two taps, not 240 months of paging. Values are
 * ISO dates (YYYY-MM-DD), the format the API stores.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

/** "14 March 2001" — unambiguous, unlike 03/14 vs 14/03. */
export function formatDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function DateField({
  label,
  required,
  value,
  onChange,
  placeholder = "Select a date",
  error,
  hint,
  min,
  max,
  initialYear,
}: {
  label: string;
  required?: boolean;
  /** YYYY-MM-DD or "". */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  /** Earliest selectable date, YYYY-MM-DD. */
  min?: string;
  /** Latest selectable date, YYYY-MM-DD. */
  max?: string;
  /** Year to open on when there is no value yet (e.g. twenty years ago for a birth date). */
  initialYear?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${value ? `, ${formatDate(value)}` : ""}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, !!error && styles.triggerError, pressed && styles.pressed]}
      >
        <CalendarDays size={18} color={value ? colors.primary : colors.faint} />
        <Text style={[styles.triggerText, !value && styles.placeholder]} numberOfLines={1}>
          {value ? formatDate(value) : placeholder}
        </Text>
        <ChevronDown size={18} color={colors.muted} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}

      {open ? (
        <CalendarSheet
          title={label}
          value={value}
          min={min}
          max={max}
          initialYear={initialYear}
          onClose={() => setOpen(false)}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

function CalendarSheet({
  title,
  value,
  min,
  max,
  initialYear,
  onClose,
  onPick,
}: {
  title: string;
  value: string;
  min?: string;
  max?: string;
  initialYear?: number;
  onClose: () => void;
  onPick: (value: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const today = todayISO();
  const start = value || (initialYear ? `${initialYear}-01-01` : (max && max < today ? max : today));
  const [year, setYear] = useState(Number(start.slice(0, 4)));
  const [month, setMonth] = useState(Number(start.slice(5, 7)) - 1);
  const [mode, setMode] = useState<"days" | "years">("days");

  const minYear = min ? Number(min.slice(0, 4)) : Number(today.slice(0, 4)) - 100;
  const maxYear = max ? Number(max.slice(0, 4)) : Number(today.slice(0, 4)) + 10;
  const allowed = (d: string) => (!min || d >= min) && (!max || d <= max);

  // Monday-first grid with leading blanks.
  const cells = useMemo(() => {
    const first = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [year, month]);

  const daysIn = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const canPrev = !min || iso(year, month, 1) > min;
  const canNext = !max || iso(year, month, daysIn) < max;
  const step = (delta: number) => {
    const m = month + delta;
    setYear(year + Math.floor(m / 12));
    setMonth(((m % 12) + 12) % 12);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]} onPress={() => undefined}>
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose}>
              <X size={22} color={colors.muted} />
            </Pressable>
          </View>

          <View style={styles.nav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              disabled={mode === "years" || !canPrev}
              onPress={() => step(-1)}
              style={[styles.navButton, (mode === "years" || !canPrev) && styles.disabled]}
            >
              <ChevronLeft size={22} color={colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose the year"
              onPress={() => setMode(mode === "days" ? "years" : "days")}
              style={styles.monthButton}
            >
              <Text style={styles.monthText}>
                {MONTHS[month]} {year}
              </Text>
              <ChevronDown
                size={18}
                color={colors.primary}
                style={{ transform: [{ rotate: mode === "years" ? "180deg" : "0deg" }] }}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              disabled={mode === "years" || !canNext}
              onPress={() => step(1)}
              style={[styles.navButton, (mode === "years" || !canNext) && styles.disabled]}
            >
              <ChevronRight size={22} color={colors.text} />
            </Pressable>
          </View>

          {mode === "years" ? (
            <YearGrid
              from={maxYear}
              to={minYear}
              selected={year}
              onPick={(y) => {
                setYear(y);
                setMode("days");
              }}
            />
          ) : (
            <>
              <View style={styles.monthStrip}>
                {MONTHS.map((m, i) => (
                  <Pressable
                    key={m}
                    onPress={() => setMonth(i)}
                    style={[styles.monthChip, i === month && styles.monthChipOn]}
                  >
                    <Text style={[styles.monthChipText, i === month && styles.monthChipTextOn]}>{m.slice(0, 3)}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.week}>
                {WEEKDAYS.map((w) => (
                  <Text key={w} style={styles.weekday}>
                    {w}
                  </Text>
                ))}
              </View>
              <View style={styles.grid}>
                {cells.map((day, i) => {
                  if (day === null) return <View key={`b${i}`} style={styles.cell} />;
                  const date = iso(year, month, day);
                  const ok = allowed(date);
                  const selected = date === value;
                  const isToday = date === today;
                  return (
                    <View key={date} style={styles.cell}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={formatDate(date)}
                        accessibilityState={{ selected, disabled: !ok }}
                        disabled={!ok}
                        onPress={() => onPick(date)}
                        style={({ pressed }) => [
                          styles.day,
                          isToday && styles.dayToday,
                          selected && styles.daySelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            !ok && styles.dayDisabled,
                            isToday && styles.dayTodayText,
                            selected && styles.daySelectedText,
                          ]}
                        >
                          {day}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function YearGrid({
  from,
  to,
  selected,
  onPick,
}: {
  from: number;
  to: number;
  selected: number;
  onPick: (year: number) => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const years = Array.from({ length: from - to + 1 }, (_, i) => from - i);
  const ROW = 52;
  const row = Math.floor(years.indexOf(selected) / 4);
  return (
    <ScrollView
      ref={scroll}
      style={styles.years}
      onLayout={() => scroll.current?.scrollTo({ y: Math.max(0, (row - 2) * ROW), animated: false })}
    >
      <View style={styles.yearWrap}>
        {years.map((y) => (
          <Pressable
            key={y}
            onPress={() => onPick(y)}
            style={({ pressed }) => [styles.year, y === selected && styles.yearOn, pressed && styles.pressed]}
          >
            <Text style={[styles.yearText, y === selected && styles.yearTextOn]}>{y}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text },
  required: { color: colors.danger },
  trigger: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  triggerError: { borderColor: colors.danger },
  triggerText: { flex: 1, fontSize: 15, color: colors.text },
  placeholder: { color: colors.faint },
  error: { fontSize: 12, color: colors.danger },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.3 },

  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text },

  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  navButton: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  monthButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    height: TOUCH,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  monthText: { fontSize: 16, fontWeight: "700", color: colors.primary },

  monthStrip: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.md },
  monthChip: {
    width: "15%",
    flexGrow: 1,
    paddingVertical: 6,
    borderRadius: radius.sm,
    alignItems: "center",
    backgroundColor: colors.background,
  },
  monthChipOn: { backgroundColor: colors.primary },
  monthChipText: { fontSize: 12, fontWeight: "600", color: colors.secondary },
  monthChipTextOn: { color: colors.white },

  week: { flexDirection: "row", marginBottom: 4 },
  weekday: { width: `${100 / 7}%`, textAlign: "center", fontSize: 12, fontWeight: "600", color: colors.faint },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  day: { flex: 1, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  dayToday: { borderWidth: 1.5, borderColor: colors.primary },
  daySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { fontSize: 15, fontWeight: "500", color: colors.text },
  dayTodayText: { color: colors.primary, fontWeight: "700" },
  daySelectedText: { color: colors.white, fontWeight: "700" },
  dayDisabled: { color: colors.border },

  years: { maxHeight: 320 },
  yearWrap: { flexDirection: "row", flexWrap: "wrap" },
  year: { width: "25%", height: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  yearOn: { backgroundColor: colors.primary },
  yearText: { fontSize: 15, fontWeight: "600", color: colors.text },
  yearTextOn: { color: colors.white },
});
