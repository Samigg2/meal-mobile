import { ScrollView, StyleSheet } from "react-native";
import { useAuth } from "@/lib/auth";
import { Card, ListRow, StatusPill, Text } from "@/components/ui";
import { MODULE_LABELS, type PermissionModule } from "@/lib/permissions";
import { colors, spacing } from "@/theme";

const MODULES: PermissionModule[] = [
  "participants",
  "enterprises",
  "training",
  "surveys",
  "monitoring",
  "feedback",
  "learning",
];

/** Which modules the signed-in role can use, as pills: Read & Write, Read only or No access. */
export default function Access() {
  const { can } = useAuth();
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        {MODULES.map((module, i) => {
          const write = can(module, "write");
          const read = can(module);
          return (
            <ListRow
              key={module}
              title={MODULE_LABELS[module]}
              chevron={false}
              last={i === MODULES.length - 1}
              right={
                <StatusPill
                  label={write ? "Read & Write" : read ? "Read only" : "No access"}
                  tone={write ? "green" : read ? "blue" : "grey"}
                />
              }
            />
          );
        })}
      </Card>
      <Text style={styles.note}>
        Roles are assigned by an administrator in the web app. The server enforces them on every request.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  card: { padding: 0, overflow: "hidden" },
  note: { fontSize: 12, color: colors.muted, lineHeight: 18 },
});
