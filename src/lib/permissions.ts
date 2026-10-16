import type { AppRole } from "@/lib/types";
/**
 * Copied from meal-mis-frontend/src/lib/permissions.ts (UI hiding only; the
 * backend matrix in common/permissions.ts is the enforcement point). Keep the
 * three copies in step when a role or module changes. Roles themselves are data
 * on the server (GET /admin/roles), loaded by AuthProvider.
 */

export type { AppRole };

/**
 * The six built-in roles, whose default permissions are the MATRIX below. An
 * administrator can create more (backend table public.roles); those start with
 * no permissions and get only what the server's overrides grant them.
 */
export const SYSTEM_ROLES = [
  "super_admin",
  "programme_manager",
  "monitoring_officer",
  "field_officer",
  "finance_officer",
  "donor_viewer",
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** One entry of GET /admin/roles. */
export interface RoleDefinition {
  key: AppRole;
  label: string;
  description: string | null;
  isSystem: boolean;
  userCount?: number;
}

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
  | "sbcc"
  // Split out of the module they used to borrow (backend migration 0049).
  | "employment"
  | "ysla"
  | "institutions"
  | "support_networks"
  | "audit"
  | "compliance"
  | "evaluations";

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
  { read: SystemRole[]; write: SystemRole[]; approve?: SystemRole[]; delete?: SystemRole[] }
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
  // Each copies the module it was split from, as the backend does.
  employment: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "donor_viewer"],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
  },
  ysla: {
    read: ["programme_manager", "finance_officer", "donor_viewer"],
    write: ["programme_manager", "finance_officer"],
    // Verifying a group's monthly report: a second person, not who entered it.
    approve: ["programme_manager"],
  },
  institutions: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "donor_viewer"],
    write: ["programme_manager", "monitoring_officer"],
    delete: ["programme_manager", "monitoring_officer"],
  },
  support_networks: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "donor_viewer"],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
    delete: ["programme_manager", "monitoring_officer", "field_officer"],
  },
  audit: { read: ["programme_manager"], write: [] },
  compliance: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "donor_viewer"],
    write: [],
  },
  // The evaluations register (TOR §5, Annex 2), 2026-10-14.
  evaluations: {
    read: ["programme_manager", "monitoring_officer", "field_officer", "donor_viewer"],
    write: ["programme_manager", "monitoring_officer"],
    delete: ["programme_manager", "monitoring_officer"],
  },
};

const BUILT_IN_LABELS: Record<SystemRole, string> = {
  super_admin: "Super admin",
  programme_manager: "Programme manager",
  monitoring_officer: "Monitoring officer",
  field_officer: "Field officer",
  finance_officer: "Finance officer",
  donor_viewer: "Donor viewer",
};

const BUILT_IN_ROLES: RoleDefinition[] = SYSTEM_ROLES.map((key) => ({
  key,
  label: BUILT_IN_LABELS[key],
  description: null,
  isSystem: true,
}));

// The roles that exist, from GET /admin/roles (loaded by AuthProvider before the
// app renders). Until then, the six built-in roles. UI only — the API decides.
let roleRegistry: RoleDefinition[] = BUILT_IN_ROLES;

export function setRoleDefinitions(roles: RoleDefinition[] | undefined): void {
  roleRegistry = roles?.length ? roles : BUILT_IN_ROLES;
}

/** Every role key, in the server's order (built-in roles first). */
export function listRoleKeys(): AppRole[] {
  return roleRegistry.map((r) => r.key);
}

export function getRoleDefinitions(): RoleDefinition[] {
  return roleRegistry;
}

/** What people see for a role. Falls back to the key for a role not loaded yet. */
export function roleLabel(key: AppRole): string {
  return roleRegistry.find((r) => r.key === key)?.label ?? key;
}

export function isSystemRole(key: AppRole): key is SystemRole {
  return (SYSTEM_ROLES as readonly string[]).includes(key);
}

/**
 * National scope: sees every cluster's data. Mirrors the backend helper of the
 * same name, which is the enforcement point — this copy only shapes the UI.
 *
 * Decided per person: someone with a role and no cluster is national; anyone
 * with a cluster is scoped to it, whatever their role.
 */
export function isGlobalScope(roles: AppRole[], organizationId: string | null): boolean {
  return organizationId === null && roles.length > 0;
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
  // A created role is named nowhere in the matrix: only overrides grant it anything.
  if (!isSystemRole(role)) return false;
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
  employment: "Employment outcomes",
  ysla: "YSLA & SACCOs",
  institutions: "Institutions",
  support_networks: "Mentors & networks",
  audit: "Audit trail",
  compliance: "Compliance",
  evaluations: "Evaluations",
};

/**
 * Which roles this person may hand out. Mirrors `assertMayGrantRole` in the
 * backend's admin.service.ts, which is the enforcement point — this copy only
 * decides what the role picker offers.
 *
 * A cluster manager runs their own cluster and may appoint anyone within it,
 * another programme manager included. `super_admin` is authority over the whole
 * programme rather than over a cluster, so only a super admin hands it out.
 */
export function grantableRoles(roles: AppRole[], all: AppRole[] = listRoleKeys()): AppRole[] {
  return roles.includes("super_admin") ? all : all.filter((r) => r !== "super_admin");
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
