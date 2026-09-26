import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { cachedFetch } from "./offline-cache";

/**
 * Admin-editable reference data (the backend's lookup_values), the same lists
 * the web app and the API use. Cached on the device so every dropdown works
 * offline; nothing here is hardcoded in the app.
 */
export interface LookupValue {
  id: string;
  category: string;
  code: string;
  label: string;
  parent_code: string | null;
  sort_order: number;
  active: boolean;
}

export type LookupsByCategory = Record<string, LookupValue[]>;

export const LOOKUPS_CACHE_KEY = "lookups";

export const fetchLookups = () =>
  cachedFetch(LOOKUPS_CACHE_KEY, () => api.get<LookupsByCategory>("/lookups"));

export function useLookups() {
  return useQuery({
    queryKey: ["lookups"],
    queryFn: fetchLookups,
    staleTime: 60 * 60 * 1000,
    gcTime: Infinity,
  });
}

export type Option = { label: string; value: string };

/** Options for one reference list, in the order an administrator set. */
export function useLookupOptions(category: string): Option[] {
  const { data } = useLookups();
  return useMemo(
    () =>
      (data?.[category] ?? [])
        .filter((v) => v.active !== false)
        .map((v) => ({ label: v.label, value: v.code })),
    [data, category],
  );
}

/** Regions, the zones of a region and the woredas of a zone, from reference data. */
export function useLocations() {
  const { data, isLoading } = useLookups();
  return useMemo(() => {
    const byParent = (category: string) => {
      const map = new Map<string, Option[]>();
      for (const v of data?.[category] ?? []) {
        if (!v.parent_code) continue;
        map.set(v.parent_code, [...(map.get(v.parent_code) ?? []), { label: v.label, value: v.code }]);
      }
      return map;
    };
    const zones = byParent("zone");
    const woredas = byParent("woreda");
    return {
      isLoading,
      loaded: !!data,
      regions: (data?.region ?? []).map((r) => ({ label: r.label, value: r.code })),
      zonesOf: (region: string) => (region ? (zones.get(region) ?? []) : []),
      woredasOf: (zone: string) => (zone ? (woredas.get(zone) ?? []) : []),
    };
  }, [data, isLoading]);
}
