import { useMemo } from "react";
import { useAuth } from "./auth";
import { useLocations } from "./reference";

/**
 * The regions a form offers, as on the web's location picker: a cluster covers
 * one region and its staff place records there only (the database refuses
 * another, 0090); national staff choose any. A record already saved elsewhere
 * keeps its region in the list, it just cannot be moved there (12Beforeend).
 */
export function useRegionChoices(current?: string) {
  const locations = useLocations();
  const { clusterRegion, isGlobalScope } = useAuth();
  return useMemo(() => {
    const locked =
      !isGlobalScope &&
      clusterRegion &&
      locations.regions.some((r) => r.value === clusterRegion)
        ? clusterRegion
        : null;
    const regions = locked
      ? locations.regions.filter(
          (r) => r.value === locked || (current && r.value === current),
        )
      : locations.regions;
    return { regions, locked };
  }, [locations.regions, clusterRegion, isGlobalScope, current]);
}
