declare module "@/platform/events/types" {
  interface DomainEventMap {
    /** A user was created and invited to set a password. */
    "member.invited": { membershipId: string; userId: string; roleId: string };
    /** Role, reporting manager or details of a member changed. */
    "member.updated": { membershipId: string; changedFields: string[] };
    /** A member lost access (M05 offers to reassign their leads). */
    "member.deactivated": { membershipId: string; userId: string };
    "member.reactivated": { membershipId: string; userId: string };
    /** The permissions of a role changed. */
    "role.permissions_changed": { roleId: string; changedPermissions: string[] };
  }
}

export {};
