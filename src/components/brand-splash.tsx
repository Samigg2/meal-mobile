import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import Svg, { Path, Rect } from "react-native-svg";
import { Text } from "@/components/ui";
import { colors, spacing } from "@/theme";

/** The sky blue of the web's sign-in logo and banner. */
const SKY = "#7DD3FC";

/** The programme mark, as on the web: an R whose leg is a leaf, sky blue on a navy rounded square. */
export function LogoMark({ size = 60 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Rect width={48} height={48} rx={10} fill={colors.navy} />
      <Path
        d="M13 42V8h13a9.5 9.5 0 0 1 0 19H13"
        stroke={SKY}
        strokeWidth={5.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M25 27c0 9 5 14 14 15 1-9-3-15-14-15Z" fill={SKY} />
    </Svg>
  );
}

/** The first screen while the app starts (fonts, then the stored session): the logo above the app's name. */
export function StartScreen() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LogoMark size={84} />
      <Text style={styles.title}>MEAL MIS Field</Text>
      <Text style={styles.subtitle}>RAYEE II</Text>
      <ActivityIndicator color={colors.white} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  title: { marginTop: spacing.xl, fontSize: 26, fontWeight: "800", color: colors.white, letterSpacing: 0.3 },
  subtitle: { marginTop: spacing.xs, fontSize: 14, fontWeight: "600", color: colors.onNavyMuted, letterSpacing: 2 },
  spinner: { marginTop: spacing.xxl },
});
