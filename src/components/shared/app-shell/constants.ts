/**
 * Cookie that remembers the collapsed sidebar. Kept in a plain module: values exported from a "use client"
 * file reach server components as client references, not as their actual value.
 */
export const SIDEBAR_COOKIE = "crm_sidebar_collapsed";
