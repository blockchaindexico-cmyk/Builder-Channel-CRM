"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";

import type { DataScopeValue } from "@/platform/rbac/permissions";

interface PermissionsValue {
  keys: string[];
  scopes: Record<string, DataScopeValue>;
}

const PermissionsContext = createContext<PermissionsValue>({ keys: [], scopes: {} });

/** Makes the signed-in user's permissions available to client components (M02-07). */
export function PermissionsProvider({
  value,
  children,
}: {
  value: PermissionsValue;
  children: ReactNode;
}) {
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/**
 * Permission checks for the UI. These only hide or show controls — services enforce permissions and data
 * scope on the server regardless of what the UI shows.
 */
export function usePermissions() {
  const value = useContext(PermissionsContext);
  return useMemo(() => {
    const keys = new Set(value.keys);
    const can = (permission: string) => keys.has("*") || keys.has(permission);
    return {
      can,
      canAny: (permissions: readonly string[]) => permissions.some(can),
      scope: (permission: string): DataScopeValue | null =>
        keys.has("*") ? "ALL" : keys.has(permission) ? (value.scopes[permission] ?? "ALL") : null,
    };
  }, [value]);
}

/** Renders `children` only when the user holds `permission` (or any of `anyOf`); otherwise `fallback`. */
export function Can({
  permission,
  anyOf,
  fallback = null,
  children,
}: {
  permission?: string;
  anyOf?: readonly string[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can, canAny } = usePermissions();
  const allowed = (permission ? can(permission) : true) && (anyOf ? canAny(anyOf) : true);
  return <>{allowed ? children : fallback}</>;
}
