import type { AppRole } from "./types";

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
  | "admin";

export type PermissionAction = "read" | "write" | "delete";

/**
 * Mirror of the database function public.has_module_permission().
 * The database is the source of truth (RLS enforces it); this table exists so the
 * UI can hide what the user is not allowed to do. Keep both in sync.
 */
const MATRIX: Record<PermissionModule, { read: AppRole[]; write: AppRole[] }> = {
  participants: {
    read: [
      "programme_manager",
      "monitoring_officer",
      "field_officer",
      "partner_officer",
      "donor_viewer",
    ],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
  },
  enterprises: {
    read: [
      "programme_manager",
      "monitoring_officer",
      "field_officer",
      "partner_officer",
      "donor_viewer",
    ],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
  },
  training: {
    read: [
      "programme_manager",
      "monitoring_officer",
      "field_officer",
      "partner_officer",
      "donor_viewer",
    ],
    write: ["programme_manager", "field_officer"],
  },
  partnerships: {
    read: ["programme_manager", "monitoring_officer", "partner_officer", "donor_viewer"],
    write: ["programme_manager", "partner_officer"],
  },
  governance: {
    read: [
      "programme_manager",
      "monitoring_officer",
      "partner_officer",
      "field_officer",
      "donor_viewer",
    ],
    write: ["programme_manager", "monitoring_officer", "partner_officer"],
  },
  actions: {
    read: [
      "programme_manager",
      "monitoring_officer",
      "field_officer",
      "partner_officer",
      "finance_officer",
    ],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
  },
  finance: {
    read: ["programme_manager", "finance_officer", "donor_viewer"],
    write: ["programme_manager", "finance_officer"],
  },
  feedback: {
    read: ["programme_manager", "monitoring_officer", "field_officer"],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
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
      "partner_officer",
      "finance_officer",
      "donor_viewer",
    ],
    write: ["programme_manager", "monitoring_officer"],
  },
  surveys: {
    read: [
      "programme_manager",
      "monitoring_officer",
      "field_officer",
      "partner_officer",
      "donor_viewer",
    ],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
  },
  learning: {
    read: [
      "programme_manager",
      "monitoring_officer",
      "field_officer",
      "partner_officer",
      "finance_officer",
      "donor_viewer",
    ],
    write: ["programme_manager", "monitoring_officer", "field_officer"],
  },
  reports: {
    read: ["programme_manager", "monitoring_officer", "finance_officer", "donor_viewer"],
    write: [],
  },
  admin: {
    read: [],
    write: [],
  },
};

/** Roles that see data across every organization. */
export const GLOBAL_ROLES: AppRole[] = [
  "super_admin",
  "programme_manager",
  "monitoring_officer",
  "donor_viewer",
];

export function isGlobalRole(roles: AppRole[]): boolean {
  return roles.some((r) => GLOBAL_ROLES.includes(r));
}

export function hasPermission(
  roles: AppRole[],
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  if (roles.includes("super_admin")) return true;
  const entry = MATRIX[module];
  if (!entry) return false;
  // Only super admins may delete arbitrary records; writers may delete their own.
  if (action === "delete") return entry.write.some((r) => roles.includes(r));
  return entry[action].some((r) => roles.includes(r));
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
};

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super admin",
  programme_manager: "Programme manager",
  monitoring_officer: "Monitoring officer",
  partner_officer: "Partner officer",
  field_officer: "Field officer",
  finance_officer: "Finance officer",
  donor_viewer: "Donor viewer",
};

export const ALL_ROLES = Object.keys(ROLE_LABELS) as AppRole[];

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
