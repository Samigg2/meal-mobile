import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import * as Location from "expo-location";
import { CircleCheck, CloudUpload, Crosshair, Plus } from "lucide-react-native";
import { Button, Card, ErrorText, Field, Select, StepBar, StickyFooter, Text } from "@/components/ui";
import { useLocations } from "@/lib/reference";
import { colors, spacing } from "@/theme";

/** The step a stepped FormScreen shows; null when the form is one page. */
const StepContext = createContext<number | null>(null);

/** One step of a stepped form: shown only while it is the current one. */
export function FormStep({ index, children }: { index: number; children: ReactNode }) {
  const current = useContext(StepContext);
  return current === null || current === index ? <>{children}</> : null;
}

/** A long form in steps (the participant register's way): titles and the fields each step holds. */
export interface FormSteps {
  titles: string[];
  fields: string[][];
  /** useLiveErrors().checkStep: shows the step's messages, true when it is fine. */
  check: (names: string[]) => boolean;
  /** The messages shown now: a failed save opens the first step with one. */
  errors: Record<string, string | undefined>;
}

/**
 * The shell of a field form: scrolling fields, the error line on top, the save
 * button at the bottom. With `steps` the form is filled one step at a time:
 * Next checks only that step, Back goes back, the last step saves.
 */
export const FormScreen = forwardRef<
  ScrollView,
  {
    error?: string;
    saveTitle: string;
    saving: boolean;
    onSave: () => void;
    steps?: FormSteps;
    children: ReactNode;
  }
>(function FormScreen({ error, saveTitle, saving, onSave, steps, children }, ref) {
  const [step, setStep] = useState(0);
  const inner = useRef<ScrollView>(null);
  useImperativeHandle(ref, () => inner.current as ScrollView);
  const last = steps ? steps.titles.length - 1 : 0;
  const go = (i: number) => {
    setStep(i);
    inner.current?.scrollTo({ y: 0, animated: false });
  };
  // A save that failed: open the first step holding a field with a message.
  const bad = steps?.fields.findIndex((names) => names.some((n) => steps.errors[n]));
  useEffect(() => {
    if (error && bad !== undefined && bad >= 0) setStep(bad);
  }, [error, bad]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={inner} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {steps ? <StepBar steps={steps.titles} step={step} onStep={(i) => i < step && go(i)} /> : null}
        <ErrorText>{error}</ErrorText>
        <StepContext.Provider value={steps ? step : null}>{children}</StepContext.Provider>
      </ScrollView>
      <StickyFooter>
        {steps ? (
          <View style={styles.footerRow}>
            {step > 0 ? (
              <View style={styles.grow}>
                <Button title="Back" variant="outline" onPress={() => go(step - 1)} />
              </View>
            ) : null}
            <View style={styles.grow}>
              {step < last ? (
                <Button title="Next step" onPress={() => steps.check(steps.fields[step]) && go(step + 1)} />
              ) : (
                <Button title={saveTitle} onPress={onSave} loading={saving} />
              )}
            </View>
          </View>
        ) : (
          <Button title={saveTitle} onPress={onSave} loading={saving} />
        )}
      </StickyFooter>
    </KeyboardAvoidingView>
  );
});

/** One card of fields with a title. */
export function FormCard({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <Card style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </Card>
  );
}

/**
 * Shown after a save: sent, or waiting on the phone until there is a connection.
 * "Record another" opens the same form empty (same participant, training, etc.),
 * for forms filled one after another in the field.
 */
export function SavedNotice({ queued, what, another = true }: { queued: boolean; what: string; another?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { queued: _reopened, ...params } = useLocalSearchParams<Record<string, string>>();
  const Icon = queued ? CloudUpload : CircleCheck;
  return (
    <View style={styles.noticeWrap}>
      <Card style={styles.notice}>
        <View
          style={[
            styles.noticeIcon,
            {
              backgroundColor: queued ? colors.warningSoft : colors.successSoft,
            },
          ]}
        >
          <Icon size={28} color={queued ? colors.warning : colors.success} strokeWidth={2.2} />
        </View>
        <Text style={styles.noticeTitle}>{queued ? "Saved on this phone" : "Sent"}</Text>
        <Text style={styles.noticeText}>
          {queued
            ? `No connection: the ${what} waits on this phone and sends itself when you are back online. Until then you can open it from Sync to correct it.`
            : `The ${what} is saved.`}
        </Text>
        <View style={styles.noticeActions}>
          {another ? (
            <Button
              title="Record another"
              icon={Plus}
              onPress={() => router.replace({ pathname: pathname as never, params })}
            />
          ) : null}
          <Button title="Done" variant={another ? "outline" : undefined} onPress={() => router.back()} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  footerRow: { flexDirection: "row", gap: spacing.sm },
  grow: { flex: 1 },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: { gap: spacing.md },
  title: { fontSize: 15, fontWeight: "700", color: colors.text },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  noticeWrap: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  notice: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  noticeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  noticeTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.xs,
  },
  noticeText: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    textAlign: "center",
  },
  noticeActions: {
    alignSelf: "stretch",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  gps: { gap: spacing.sm },
  gpsText: { fontSize: 13, color: colors.text },
});

/**
 * Region, zone and woreda picked from reference data (kept on the phone), typed
 * where a list has nothing for the place above. Changing one clears those below.
 */
export function PlaceFields({
  value,
  onChange,
  required,
  errors = {},
}: {
  value: { region: string; zone: string; woreda: string };
  onChange: (next: { region: string; zone: string; woreda: string }) => void;
  required?: boolean;
  errors?: Record<string, string | undefined>;
}) {
  const locations = useLocations();
  const zones = locations.zonesOf(value.region);
  const woredas = locations.woredasOf(value.zone);
  return (
    <>
      <Select
        label="Region"
        required={required}
        value={value.region || undefined}
        options={locations.regions}
        onChange={(region) => onChange({ region, zone: "", woreda: "" })}
        placeholder="Select region"
        error={errors.region}
      />
      {zones.length > 0 ? (
        <Select
          label="Zone"
          required={required}
          value={value.zone || undefined}
          options={zones}
          onChange={(zone) => onChange({ ...value, zone, woreda: "" })}
          placeholder={value.region ? "Select zone" : "Select the region first"}
          disabled={!value.region}
          error={errors.zone}
        />
      ) : (
        <Field
          label="Zone"
          required={required}
          value={value.zone}
          onChangeText={(zone) => onChange({ ...value, zone, woreda: "" })}
          autoCapitalize="words"
          error={errors.zone}
        />
      )}
      {woredas.length > 0 ? (
        <Select
          label="Woreda"
          required={required}
          value={value.woreda || undefined}
          options={woredas}
          onChange={(woreda) => onChange({ ...value, woreda })}
          placeholder="Select woreda"
          error={errors.woreda}
        />
      ) : (
        <Field
          label="Woreda"
          required={required}
          value={value.woreda}
          onChangeText={(woreda) => onChange({ ...value, woreda })}
          autoCapitalize="words"
          error={errors.woreda}
        />
      )}
    </>
  );
}

export interface GpsPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/** A GPS point taken on the spot (works offline: the phone's own GPS). */
export function GpsField({
  value,
  onChange,
  what,
}: {
  value: GpsPoint | null;
  onChange: (p: GpsPoint | null) => void;
  what: string;
}) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function capture() {
    setLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission was refused.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      onChange({
        latitude: Number(pos.coords.latitude.toFixed(6)),
        longitude: Number(pos.coords.longitude.toFixed(6)),
        accuracy: Math.round(pos.coords.accuracy ?? 0),
      });
    } catch {
      setError("Could not get a GPS fix. Try again in the open.");
    } finally {
      setLocating(false);
    }
  }

  return (
    <View style={styles.gps}>
      <Text style={value ? styles.gpsText : styles.hint}>
        {value
          ? `${value.latitude}, ${value.longitude}  ±${value.accuracy} m${value.accuracy > 100 ? " (weak fix, retry in the open)" : ""}`
          : `No GPS point for this ${what} yet. Take it standing at the place.`}
      </Text>
      <Button
        title={value ? "Take GPS again" : "Take GPS"}
        icon={Crosshair}
        variant="outline"
        onPress={capture}
        loading={locating}
      />
      {value ? <Button title="Remove GPS point" variant="outline" onPress={() => onChange(null)} /> : null}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}
