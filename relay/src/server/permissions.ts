/** Permission catalog. Roles are bags of these; names are never checked, only permissions (F1.3). */
export const PERMISSIONS = {
  "crm.view": "View CRM records",
  "crm.view_all": "View records owned by others",
  "crm.create": "Create CRM records",
  "crm.edit": "Edit CRM records",
  "crm.delete": "Delete CRM records",
  "crm.export": "Export CRM records",
  "crm.view_value": "See opportunity values",
  "config.manage": "Manage pipelines and custom fields",
  "leads.rules": "Manage assignment rules",
  "leads.manage": "Reassign leads and set team availability",
  "integrations.manage": "Manage integrations",
  "audit.view": "View audit history",
  "users.manage": "Invite users and manage roles",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const DEFAULT_ROLES: { name: string; permissions: Permission[] }[] = [
  { name: "Admin", permissions: ALL_PERMISSIONS },
  {
    name: "Manager",
    permissions: ["crm.view", "crm.view_all", "crm.create", "crm.edit", "crm.export", "crm.view_value", "leads.manage", "audit.view"],
  },
  { name: "Sales", permissions: ["crm.view", "crm.create", "crm.edit"] },
];

export const isPermission = (p: string): p is Permission => p in PERMISSIONS;
