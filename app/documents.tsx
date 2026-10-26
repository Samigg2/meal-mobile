import { ScrollView, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { DocumentPhotos, type DocumentType } from "@/components/document-photos";
import { Text } from "@/components/ui";
import { colors, spacing } from "@/theme";

/** The documents of one job or loan, opened from the participant's page. */
export default function Documents() {
  const { module, id, types, title } = useLocalSearchParams<{
    module: "participants" | "finance" | "employment";
    id: string;
    types: string;
    title?: string;
  }>();
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <DocumentPhotos module={module} recordId={id} types={types.split(",") as DocumentType[]} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
});
