/** Permission keys of the identity module (M02). */
export const IDENTITY_PERMISSIONS = {
  /** View users/team members — scoped: TEAM for managers (their reporting tree), ALL for admins. */
  usersView: "users.view",
  /** Create, edit, deactivate users; resend invitations; trigger password resets. */
  usersManage: "users.manage",
  /** Edit roles and their permissions. */
  rolesManage: "roles.manage",
  /** Review the audit log. */
  auditView: "audit.view",
} as const;

export const SYSTEM_ROLES = [
  {
    key: "admin",
    name: "Admin",
    description: "Full control of the organization, users, settings and data.",
  },
  {
    key: "manager",
    name: "Manager",
    description: "Manages a team of executives: their leads, activities and performance.",
  },
  {
    key: "executive",
    name: "Executive",
    description: "Works on their assigned leads and customer activities.",
  },
] as const;

export type SystemRoleKey = (typeof SYSTEM_ROLES)[number]["key"];
export const ADMIN_ROLE_KEY: SystemRoleKey = "admin";
