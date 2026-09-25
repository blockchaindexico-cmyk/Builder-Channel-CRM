import type { ReactNode } from "react";

/**
 * Extension points owned by the identity module.
 *
 * - `member.detail.action`: extra buttons in the header of a user's page in Settings → Users, rendered on the
 *   server (M05: "Hand over leads & deactivate").
 * - `profile.tab`: extra tabs on "My profile" for the signed-in person, rendered on the server (M06:
 *   notification preferences).
 */
export interface MemberDetailAction {
  key: string;
  order: number;
  render: (props: {
    membershipId: string;
    name: string;
    status: string;
  }) => Promise<ReactNode> | ReactNode;
}

export interface ProfileTab {
  /** Value of `?tab=`, e.g. "notifications". */
  key: string;
  label: string;
  order: number;
  render: () => Promise<ReactNode> | ReactNode;
}

declare module "@/platform/registry/ui" {
  interface UiExtensionMap {
    "member.detail.action": MemberDetailAction;
    "profile.tab": ProfileTab;
  }
}
