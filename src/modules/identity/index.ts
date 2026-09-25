/** Public API of the identity module (M02). Other modules import only from here. */
export type { MemberDetailAction, ProfileTab } from "./extensions";
export { identityManifest } from "./manifest";
export { ADMIN_ROLE_KEY, IDENTITY_PERMISSIONS, SYSTEM_ROLES } from "./permissions";
export {
  deactivateMember,
  findMembers,
  type FoundMember,
  listMemberOptions,
} from "./server/members";
export { getMyAvatarUrl } from "./server/profile";
export { ensureCustomRole, listRoleOptions, type RoleGrant, syncSystemRoles } from "./server/roles";
