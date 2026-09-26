import type { AppRole } from "@/lib/types";
/**
 * Copied from meal-mis-frontend/src/lib/permissions.ts (UI hiding only; the
 * backend matrix in common/permissions.ts is the enforcement point). Keep the
 * three copies in step when a role or module changes.
 */

export type { AppRole };

export type PermissionModule =
  | "participants"
  | "enterprises"
  | "training"
  | "partnerships"
  | "governance"
  | "actions"
  | "finance"
  | "feedback"
  | "safeguarding"
  | "monitoring"
  | "surveys"
  | "learning"
  | "reports"
  | "admin"
  | "material"
  | "empowerment"
  | "sbcc";

/** "approve" is the TOR's verification step (S6, Step 2), distinct from "write". */
export type PermissionAction = "read" | "write" | "delete" | "approve";

/**
 * Mirror of the database function public.has_module_permission().
 * The database is the source of truth (RLS enforces it); this table exists so the
 * UI can hide what the user is not allowed to do. Keep both in sync.
 */
/**
 * `delete` is an explicit column, not a synonym for `write`. Omitting it means
 * super admins only — participants, safeguarding and finance are omitted
 * deliberately. Mirrors the backend, which is the enforcement point.
 */
const MATRIX: Record<
  PermissionModule,
  { read: AppRole[]; write: AppRole[]; approve?: AppRole[]; delete?: AppRole[] }
> = {
  participants: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "donor_viewer"],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
    // Not field_officer: the author of a registration does not review it.
    approve: ["programme_manager", "monitoring_officer"],
  },
  enterprises: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "donor_viewer"],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
    delete: ["programme_manager", "monitoring_officer", "field_officer"],
  },
  training: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "donor_viewer"],
    write: ["programme_manager", "field_officer"],
    delete: ["programme_manager", "field_officer"],
  },
  partnerships: {
    read: ["programme_manager", "monitoring_officer", "donor_viewer"],
    write: ["programme_manager"],
    delete: ["programme_manager"],
  },
  governance: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "donor_viewer"],
    write: ["programme_manager", "monitoring_officer"],
    delete: ["programme_manager", "monitoring_officer"],
  },
  actions: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "finance_officer"],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
    delete: ["programme_manager", "monitoring_officer", "field_officer"],
  },
  finance: {
    read: ["programme_manager", "finance_officer", "donor_viewer"],
    write: ["programme_manager", "finance_officer"],
  },
  feedback: {
    read: ["programme_manager", "monitoring_officer", "field_officer"],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
    delete: ["programme_manager", "monitoring_officer", "field_officer"],
  },
  safeguarding: {
    read: ["programme_manager"],
    write: ["programme_manager"],
  },
  monitoring: {
    read: [
      "programme_manager",
      "monitoring_officer",
      "field_officer",
      "finance_officer",
      "donor_viewer",
    ],
    write: ["programme_manager", "monitoring_officer"],
    // Verifying a reported indicator value is a second person's job.
    approve: ["programme_manager", "monitoring_officer"],
    delete: ["programme_manager", "monitoring_officer"],
  },
  surveys: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "donor_viewer"],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
    // Verifying a response is a second person's job, as with registrations.
    approve: ["programme_manager", "monitoring_officer"],
    delete: ["programme_manager", "monitoring_officer", "field_officer"],
  },
  learning: {
    read: [
      "programme_manager",
      "monitoring_officer",
      "field_officer",
      "finance_officer",
      "donor_viewer",
    ],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
    delete: ["programme_manager", "monitoring_officer", "field_officer"],
  },
  reports: {
    read: ["programme_manager", "monitoring_officer", "finance_officer", "donor_viewer"],
    write: [],
  },
  // Programme managers administer their own cluster. Every admin action is
  // scoped to the caller's cluster on the server; creating or renaming a
  // cluster stays super-admin-only.
  admin: {
    read: ["programme_manager"],
    write: ["programme_manager"],
  },
  material: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "donor_viewer"],
    write: ["programme_manager", "field_officer"],
    delete: ["programme_manager", "field_officer"],
  },
  empowerment: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "donor_viewer"],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
    delete: ["programme_manager", "monitoring_officer", "field_officer"],
  },
  sbcc: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "donor_viewer"],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
    delete: ["programme_manager", "monitoring_officer", "field_officer"],
  },
};

/**
 * Roles *allowed* to hold national scope. Holding one is necessary but not
 * sufficient — see isGlobalScope below.
 */
export const GLOBAL_ROLES: AppRole[] = [
  "super_admin",
  "programme_manager",
  "monitoring_officer",
  "donor_viewer",
];

export function isGlobalRole(roles: AppRole[]): boolean {
  return roles.some((r) => GLOBAL_ROLES.includes(r));
}

/**
 * National scope: sees every cluster's data. Mirrors the backend helper of the
 * same name, which is the enforcement point — this copy only shapes the UI.
 *
 * A user assigned to a cluster is scoped to it whatever their role.
 */
export function isGlobalScope(roles: AppRole[], organizationId: string | null): boolean {
  return organizationId === null && isGlobalRole(roles);
}

// The server's overrides for this user's cluster (already merged: cluster over
// programme-wide), applied on top of the built-in table. Empty until loaded,
// which leaves the table above in charge. UI hiding only — the API decides.
let overrides = new Map<string, boolean>();

const overrideKey = (role: AppRole, module: PermissionModule, action: PermissionAction) =>
  `${role}|${module}|${action}`;

export function setPermissionOverrides(
  rows: { role: AppRole; module: PermissionModule; action: PermissionAction; allowed: boolean }[],
): void {
  overrides = new Map(rows.map((r) => [overrideKey(r.role, r.module, r.action), r.allowed]));
}

/** Cells nobody can change: a super admin, and a programme manager's Administration. */
export function isLockedCell(role: AppRole, module: PermissionModule): boolean {
  return role === "super_admin" || (role === "programme_manager" && module === "admin");
}

function builtInAllows(role: AppRole, module: PermissionModule, action: PermissionAction): boolean {
  const entry = MATRIX[module];
  if (!entry) return false;
  // Absent means super admins only, for both: "unspecified" must mean "no".
  if (action === "delete") return (entry.delete ?? []).includes(role);
  if (action === "approve") return (entry.approve ?? []).includes(role);
  return entry[action].includes(role);
}

export function hasPermission(
  roles: AppRole[],
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  if (roles.includes("super_admin")) return true;
  if (!MATRIX[module]) return false;
  return roles.some((role) =>
    isLockedCell(role, module)
      ? builtInAllows(role, module, action)
      : (overrides.get(overrideKey(role, module, action)) ?? builtInAllows(role, module, action)),
  );
}

export const MODULE_LABELS: Record<PermissionModule, string> = {
  participants: "Participants",
  enterprises: "Enterprises",
  training: "Training",
  partnerships: "Partnerships",
  governance: "Governance & advocacy",
  actions: "Action tracker",
  finance: "Finance",
  feedback: "Feedback",
  safeguarding: "Safeguarding",
  monitoring: "Monitoring & KPIs",
  surveys: "Surveys",
  learning: "Learning & knowledge",
  reports: "Reports",
  admin: "Administration",
  material: "Material & technical support",
  empowerment: "Women empowerment",
  sbcc: "SBCC campaigns",
};

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super admin",
  programme_manager: "Programme manager",
  monitoring_officer: "Monitoring officer",
  field_officer: "Field officer",
  finance_officer: "Finance officer",
  donor_viewer: "Donor viewer",
};

export const ALL_ROLES = Object.keys(ROLE_LABELS) as AppRole[];

/**
 * Which roles this person may hand out. Mirrors `assertMayGrantRole` in the
 * backend's admin.service.ts, which is the enforcement point — this copy only
 * decides what the role picker offers.
 *
 * A cluster manager runs their own cluster and may appoint anyone within it,
 * another programme manager included. `super_admin` is authority over the whole
 * programme rather than over a cluster, so only a super admin hands it out.
 */
export function grantableRoles(roles: AppRole[]): AppRole[] {
  return roles.includes("super_admin") ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "super_admin");
}

/** Server-side guard used by server functions (defence in depth on top of RLS). */
export function assertPermission(
  roles: AppRole[],
  module: PermissionModule,
  action: PermissionAction,
): void {
  if (!hasPermission(roles, module, action)) {
    throw new Error(
      `Forbidden: your role does not allow ${action} access to ${MODULE_LABELS[module]}`,
    );
  }
}
