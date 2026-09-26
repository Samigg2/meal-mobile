import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Eye,
  EyeOff,
  Inbox,
  Plus,
  Search,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  colors,
  fontFamilies,
  pillTones,
  radius,
  shadow,
  spacing,
  TOUCH,
  topics,
  type PillTone,
  type TopicName,
} from "@/theme";

/* --------------------------------- text ---------------------------------- */

/**
 * Text in Plus Jakarta Sans. React Native cannot choose a weight from a custom
 * family, so the `fontWeight` in a style picks the matching family instead.
 * Until the font has loaded (or if it fails) the system font is used.
 */
export function Text({ style, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const weight = String(flat?.fontWeight ?? "400");
  const key =
    weight === "bold" || weight === "700" || weight === "900"
      ? "700"
      : weight === "800"
        ? "800"
        : weight === "600"
          ? "600"
          : weight === "500"
            ? "500"
            : "400";
  return <RNText {...props} style={[style, { fontFamily: fontFamilies[key], fontWeight: undefined }]} />;
}

/* -------------------------------- surfaces ------------------------------- */

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A solid or tinted square/circle holding an icon. */
export function IconBox({
  icon: Icon,
  color,
  tint,
  size = 40,
  solid,
  round,
}: {
  icon: LucideIcon;
  color: string;
  tint?: string;
  size?: number;
  /** Solid colour with a white icon (KPI circles); otherwise tint with a coloured icon. */
  solid?: boolean;
  round?: boolean;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: round || solid ? size / 2 : radius.md,
        backgroundColor: solid ? color : (tint ?? colors.primarySoft),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={Math.round(size * 0.5)} color={solid ? colors.white : color} strokeWidth={2.2} />
    </View>
  );
}

/** A titled group of fields inside a form. */
export function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Card style={styles.section}>
      <View style={styles.sectionHead}>
        {icon ? <IconBox icon={icon} color={colors.primary} tint={colors.primarySoft} size={32} round /> : null}
        <View style={styles.flex}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
        </View>
      </View>
      {children}
    </Card>
  );
}

/* -------------------------------- buttons -------------------------------- */

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
  icon: Icon,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** `outlineDanger` is the white button with a red border used for sign out. */
  variant?: "primary" | "outline" | "danger" | "outlineDanger";
  icon?: LucideIcon;
}) {
  const isDisabled = disabled || loading;
  const textColor =
    variant === "outline" ? colors.text : variant === "outlineDanger" ? colors.danger : colors.white;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "outline" && styles.buttonOutline,
        variant === "danger" && styles.buttonDanger,
        variant === "outlineDanger" && styles.buttonOutlineDanger,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "outline" || variant === "outlineDanger" ? colors.primary : colors.white} />
      ) : (
        <View style={styles.buttonInner}>
          {Icon ? <Icon size={18} color={textColor} strokeWidth={2.2} /> : null}
          <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Round primary button pinned above the tab bar. */
export function FAB({ onPress, label, icon: Icon = Plus }: { onPress: () => void; label?: string; icon?: LucideIcon }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? "Add"}
      onPress={onPress}
      style={({ pressed }) => [styles.fab, label ? styles.fabExtended : null, pressed && styles.buttonPressed]}
    >
      <Icon size={24} color={colors.white} strokeWidth={2.4} />
      {label ? <Text style={styles.fabText}>{label}</Text> : null}
    </Pressable>
  );
}

/** Pinned bottom bar for a form's Save button; respects the home indicator. */
export function StickyFooter({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>{children}</View>;
}

/* --------------------------------- inputs -------------------------------- */

export function Field({
  label,
  required,
  hint,
  error,
  leftIcon: LeftIcon,
  ...props
}: TextInputProps & {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  leftIcon?: LucideIcon;
}) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  const isSecret = !!props.secureTextEntry;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View
        style={[
          styles.inputWrap,
          props.multiline && styles.inputMultiline,
          focused && styles.inputFocused,
          !!error && styles.inputError,
        ]}
      >
        {LeftIcon ? <LeftIcon size={18} color={colors.faint} /> : null}
        <TextInput
          style={[styles.input, props.multiline && styles.inputTextMultiline]}
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          {...props}
          secureTextEntry={isSecret && !reveal}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
        />
        {isSecret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={reveal ? "Hide password" : "Show password"}
            hitSlop={10}
            onPress={() => setReveal((v) => !v)}
          >
            {reveal ? <EyeOff size={18} color={colors.muted} /> : <Eye size={18} color={colors.muted} />}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Full-width search box with an optional filter button. */
export function SearchBar({
  value,
  onChangeText,
  placeholder,
  onFilterPress,
  filterCount,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onFilterPress?: () => void;
  filterCount?: number;
}) {
  return (
    <View style={styles.searchRow}>
      <View style={styles.searchBox}>
        <Search size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          value={value}
          onChangeText={onChangeText}
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>
      {onFilterPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filters"
          onPress={onFilterPress}
          style={[styles.filterButton, !!filterCount && styles.filterButtonActive]}
        >
          <SlidersHorizontal size={20} color={filterCount ? colors.white : colors.secondary} />
          {filterCount ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/** Single-choice chips, for short lists (two to four options). */
export function ChoiceRow<T extends string>({
  label,
  required,
  value,
  options,
  onChange,
  error,
}: {
  label: string;
  required?: boolean;
  value: T | undefined;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
  error?: string | null;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

/** A bottom sheet on Modal, so it behaves the same on both platforms. */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]} onPress={() => undefined}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetList}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A dropdown that opens a bottom sheet. */
export function Select<T extends string>({
  label,
  required,
  value,
  options,
  onChange,
  placeholder = "Select…",
  error,
  hint,
  disabled,
}: {
  label: string;
  required?: boolean;
  value: T | undefined;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);
  // Long lists (zones, woredas) get a search box so a field officer is not
  // scrolling through hundreds of names.
  const searchable = options.length > 8;
  const shown = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
        style={[
          styles.inputWrap,
          styles.selectTrigger,
          !!error && styles.inputError,
          disabled && { opacity: 0.5 },
        ]}
      >
        <Text style={[styles.selectText, !selected && styles.selectPlaceholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDown size={18} color={colors.muted} />
      </Pressable>
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}>
        {searchable ? (
          <View style={[styles.inputWrap, { marginBottom: spacing.sm }]}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search…"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCorrect={false}
            />
          </View>
        ) : null}
        {shown.length === 0 ? <Text style={styles.hint}>No match. Choose &ldquo;Other&rdquo; to type it.</Text> : null}
        {shown.map((option) => {
          const isSelected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="menuitem"
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            >
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option.label}</Text>
              {isSelected ? <Check size={20} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </View>
  );
}

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={styles.toggleRow}
    >
      <View style={[styles.checkbox, value && styles.checkboxOn]}>
        {value ? <Check size={16} color={colors.white} strokeWidth={3} /> : null}
      </View>
      <Text style={styles.toggleLabel}>{label}</Text>
    </Pressable>
  );
}

/** Segmented control, e.g. Active · Draft · Closed. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {o.label}
              {o.count !== undefined ? ` ${o.count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------------------------- pills -------------------------------- */

/** "no_consent" -> "No consent"; only the first letter is raised, the rest is left as given. */
const sentence = (s?: string | null) => {
  const t = (s ?? "").replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** The shared status pill: colours per tone, optional icon, optional outline style. */
export function StatusPill({
  label,
  tone = "blue",
  icon: Icon,
  outline,
}: {
  label: string;
  tone?: PillTone;
  icon?: LucideIcon;
  outline?: boolean;
}) {
  const t = pillTones[tone];
  return (
    <View
      style={[
        styles.pill,
        outline ? { backgroundColor: colors.white, borderWidth: 1, borderColor: t.fg } : { backgroundColor: t.bg },
      ]}
    >
      {Icon ? <Icon size={12} color={t.fg} strokeWidth={2.4} /> : null}
      <Text style={[styles.pillText, { color: t.fg }]}>{sentence(label)}</Text>
    </View>
  );
}

/** Older call sites: maps the previous tones onto the shared pill colours. */
export function Badge({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const map = { neutral: "blue", success: "green", warning: "amber", danger: "red" } as const;
  return <StatusPill label={text.replace(/_/g, " ")} tone={map[tone]} />;
}

/* --------------------------------- content ------------------------------- */

/** KPI card: solid topic circle, big coloured number, label, optional sub-line, accent bar. */
export function StatCard({
  topic,
  label,
  value,
  sub,
}: {
  topic: TopicName;
  label: string;
  value: string | number;
  sub?: string;
}) {
  const t = topics[topic];
  return (
    <View style={styles.statCard}>
      <View style={styles.statTop}>
        <IconBox icon={t.icon} color={t.color} size={40} solid />
        <View style={styles.flex}>
          <Text style={[styles.statValue, { color: t.color }]}>{value}</Text>
        </View>
      </View>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
      <View style={[styles.statBar, { backgroundColor: t.color }]} />
    </View>
  );
}

/** A 52px settings-style row: tinted icon square, title, optional subtitle/right slot, chevron. */
export function ListRow({
  icon,
  color = colors.primary,
  tint = colors.primarySoft,
  title,
  subtitle,
  right,
  onPress,
  chevron = true,
  last,
}: {
  icon?: LucideIcon;
  color?: string;
  tint?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  last?: boolean;
}) {
  const content = (
    <View style={[styles.listRow, !last && styles.listRowDivider]}>
      {icon ? <IconBox icon={icon} color={color} tint={tint} size={36} /> : null}
      <View style={styles.flex}>
        <Text style={styles.listTitle}>{title}</Text>
        {subtitle ? <Text style={styles.listSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
      {onPress && chevron ? <ChevronRight size={18} color={colors.faint} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && styles.optionPressed}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function ProgressBar({ value, color = colors.primary }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export function EmptyState({
  title,
  message,
  icon: Icon = Inbox,
  color = colors.primary,
  tint = colors.primarySoft,
  action,
}: {
  title: string;
  message: string;
  icon?: LucideIcon;
  color?: string;
  tint?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <IconBox icon={Icon} color={color} tint={tint} size={64} round />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <View style={styles.errorBox}>
      <CircleAlert size={18} color={colors.danger} />
      <Text style={styles.error}>{children}</Text>
    </View>
  );
}

/** A pulsing placeholder block; use instead of a spinner while a list loads. */
export function Skeleton({ width = "100%", height = 16, borderRadius = 8, style }: {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // Created once and kept in state: reading a ref during render breaks the
  // React compiler rules, and the value must survive re-renders.
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, borderRadius, backgroundColor: "#E2E8F0", opacity }, style]} />;
}

/** Skeleton rows shaped like list cards. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.card, styles.skeletonRow]}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={styles.flex}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow,
  },
  section: { gap: spacing.lg },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, letterSpacing: -0.2 },
  sectionDescription: { fontSize: 12, color: colors.muted, marginTop: 1 },
  button: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  buttonPrimary: {
    backgroundColor: colors.primary,
    ...Platform.select({
      ios: { shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      default: { elevation: 2 },
    }),
  },
  buttonOutline: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  buttonDanger: { backgroundColor: colors.danger },
  buttonOutlineDanger: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  buttonText: { fontWeight: "700", fontSize: 16 },
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabExtended: { width: "auto", paddingHorizontal: spacing.lg + 4 },
  fabText: { color: colors.white, fontWeight: "700", fontSize: 15 },
  footer: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text },
  required: { color: colors.danger },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  fieldError: { fontSize: 12, color: colors.danger },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 12, fontFamily: fontFamilies["400"] },
  inputMultiline: { minHeight: 96, alignItems: "flex-start", paddingTop: 4 },
  inputTextMultiline: { textAlignVertical: "top", minHeight: 88 },
  inputFocused: { borderColor: colors.primary, borderWidth: 1.5 },
  inputError: { borderColor: colors.danger },
  selectTrigger: { justifyContent: "space-between" },
  selectText: { flex: 1, fontSize: 15, color: colors.text },
  selectPlaceholder: { color: colors.faint },
  searchRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: TOUCH,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, fontFamily: fontFamilies["400"], paddingVertical: 0 },
  filterButton: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  filterButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterBadgeText: { color: colors.white, fontSize: 10, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    maxHeight: "80%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  sheetList: { flexGrow: 0 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    minHeight: TOUCH,
  },
  optionPressed: { backgroundColor: colors.primarySoft },
  optionText: { fontSize: 16, color: colors.text },
  optionTextSelected: { color: colors.primary, fontWeight: "700" },
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
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.text },
  chipTextSelected: { color: colors.white, fontWeight: "700" },
  toggleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.xs },
  checkbox: {
    width: 24,
    height: 24,
    marginTop: 1,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleLabel: { fontSize: 14, color: colors.text, flex: 1, lineHeight: 20 },
  segment: {
    flexDirection: "row",
    backgroundColor: "#E9EEF6",
    borderRadius: radius.md,
    padding: 3,
  },
  segmentItem: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.md - 3 },
  segmentItemActive: { backgroundColor: colors.white, ...shadow },
  segmentText: { fontSize: 13, fontWeight: "600", color: colors.muted },
  segmentTextActive: { color: colors.text },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: 11, fontWeight: "700" },
  statCard: {
    flex: 1,
    minWidth: 140,
    minHeight: 96,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    paddingBottom: 17,
    gap: 6,
    overflow: "hidden",
    ...shadow,
  },
  statTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  statValue: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  statLabel: { fontSize: 13, fontWeight: "600", color: colors.secondary },
  statSub: { fontSize: 12, color: colors.muted },
  statBar: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  listRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  listTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  listSubtitle: { fontSize: 12, color: colors.muted, marginTop: 1 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "#EEF2F7", overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: spacing.sm },
  emptyMessage: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 19 },
  emptyAction: { marginTop: spacing.md, alignSelf: "stretch" },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  error: { color: colors.danger, fontSize: 13, flex: 1, lineHeight: 18 },
  skeletonList: { gap: spacing.md, paddingHorizontal: spacing.lg },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  loading: { padding: spacing.xxl, alignItems: "center", gap: spacing.sm },
  loadingText: { color: colors.muted, fontSize: 13 },
});
