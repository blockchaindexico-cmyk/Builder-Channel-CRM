/**
 * Server-rendered UI contributions between modules (e.g. M07 adds a "Calls" panel to the lead page). Unlike
 * client-safe manifests, these may be async server components; unlike server modules, they are never loaded
 * by the worker. Extension points are declared by the owning module through declaration merging:
 *
 * ```ts
 * declare module "@/platform/registry/ui" {
 *   interface UiExtensionMap { "lead.detail.panel": LeadDetailPanel }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UiExtensionMap {}

export interface UiModule {
  key: string;
  extensions?: { [Point in keyof UiExtensionMap]?: readonly UiExtensionMap[Point][] };
}

export interface UiRegistry {
  extensions<Point extends keyof UiExtensionMap>(point: Point): readonly UiExtensionMap[Point][];
}

export function buildUiRegistry(modules: readonly UiModule[]): UiRegistry {
  return {
    extensions(point) {
      return modules.flatMap(
        (module) => (module.extensions?.[point] ?? []) as readonly UiExtensionMap[typeof point][],
      );
    },
  };
}
