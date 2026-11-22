import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { cachedFetch } from "./offline-cache";
import type { Option } from "./reference";

/**
 * F01-22: the lead firms a wage participant can be linked to (institutions of
 * type lead_firm, as on the web). Kept on the device so the choice also works
 * offline. A role that cannot read institutions gets an empty list: the field
 * is optional, so registration is never blocked by it.
 */
async function loadLeadFirms(): Promise<Option[]> {
  try {
    const rows = await cachedFetch("lead-firms", () =>
      api.get<{ id: string; institution_name: string; institution_type: string | null }[]>("/institutions"),
    );
    return rows
      .filter((r) => r.institution_type === "lead_firm")
      .map((r) => ({ label: r.institution_name, value: r.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    return [];
  }
}

export function useLeadFirms(enabled: boolean) {
  const { data, isLoading } = useQuery({
    queryKey: ["lead-firms"],
    queryFn: loadLeadFirms,
    enabled,
    staleTime: 60 * 60 * 1000,
    gcTime: Infinity,
  });
  return { leadFirms: data ?? [], isLoading };
}
