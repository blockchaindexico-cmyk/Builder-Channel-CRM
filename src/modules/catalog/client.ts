/**
 * Client-side public API of the catalogue (components other modules may render). Kept apart from
 * `index.ts` so browser bundles never pull in server code.
 */
export { ProjectQuickInfoSheet } from "./components/projects/project-quick-info";
export { AreaRange, PriceRange } from "./components/shared/price-range";
export { InactiveBadge, ProjectStatusBadge } from "./components/shared/project-status-badge";
