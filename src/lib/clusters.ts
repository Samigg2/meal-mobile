import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { cachedFetch } from "./offline-cache";

export type ClusterOption = { label: string; value: string; region: string | null };

/**
 * F01-13 (backend 0138): the RAYEE II clusters, for the registration's
 * cluster list and to name a clustered user's own. Kept on the device so the
 * list also works offline; an empty list never blocks a registration (the
 * API then works the cluster out from the region).
 */
async function loadClusters(): Promise<ClusterOption[]> {
  try {
    const rows = await cachedFetch("clusters", () =>
      api.get<{ id: string; name: string; region: string | null }[]>("/admin/organizations"),
    );
    return rows.map((r) => ({ label: r.name, value: r.id, region: r.region }));
  } catch {
    return [];
  }
}

export function useClusters() {
  const { data, isLoading } = useQuery({
    queryKey: ["clusters"],
    queryFn: loadClusters,
    staleTime: 60 * 60 * 1000,
    gcTime: Infinity,
  });
  return { clusters: data ?? [], isLoading };
}
