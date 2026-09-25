import type { ReactNode } from "react";

/**
 * Extension points owned by dashboards & reports (M10).
 *
 * - `dashboard.widget`: cards other modules add to the dashboard (M09 finance), rendered on the server for the
 *   period and scope being viewed.
 */
export interface DashboardWidgetProps {
  range: { from: string; to: string };
  /** Whose figures the dashboard shows: the viewer, their team or the organization. */
  scope: "OWN" | "TEAM" | "ALL";
}

export interface DashboardWidget {
  key: string;
  order: number;
  /** Shown only with this permission. */
  permission?: string;
  /** Scopes the widget makes sense for (default: all). */
  scopes?: readonly ("OWN" | "TEAM" | "ALL")[];
  /** Full width instead of half. */
  wide?: boolean;
  render: (props: DashboardWidgetProps) => Promise<ReactNode> | ReactNode;
}

declare module "@/platform/registry/ui" {
  interface UiExtensionMap {
    "dashboard.widget": DashboardWidget;
  }
}
