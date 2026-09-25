import type { ReactNode } from "react";

/**
 * Extension points of the application shell, rendered on the server for the signed-in member:
 *
 * - `app.header.action`: controls in the top bar, left of the theme and user menus (M06 notification bell).
 * - `app.banner`: messages above every page (M06 announcements).
 */
export interface ShellContribution {
  key: string;
  order: number;
  render: () => Promise<ReactNode> | ReactNode;
}

declare module "@/platform/registry/ui" {
  interface UiExtensionMap {
    "app.header.action": ShellContribution;
    "app.banner": ShellContribution;
  }
}
