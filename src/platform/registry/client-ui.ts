/**
 * Client components that modules contribute to other modules' client components (e.g. M05 adds "Assign" to the
 * lead list's bulk bar). Kept apart from manifests, which must stay plain data usable by the worker and the seed.
 * Extension points are declared by the owning module through declaration merging:
 *
 * ```ts
 * declare module "@/platform/registry/client-ui" {
 *   interface ClientUiExtensionMap { "lead.list.bulk-action": LeadBulkAction }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientUiExtensionMap {}

export interface ClientUiModule {
  key: string;
  extensions?: { [Point in keyof ClientUiExtensionMap]?: readonly ClientUiExtensionMap[Point][] };
}

export interface ClientUiRegistry {
  extensions<Point extends keyof ClientUiExtensionMap>(
    point: Point,
  ): readonly ClientUiExtensionMap[Point][];
}

export function buildClientUiRegistry(modules: readonly ClientUiModule[]): ClientUiRegistry {
  return {
    extensions(point) {
      return modules.flatMap(
        (module) =>
          (module.extensions?.[point] ?? []) as readonly ClientUiExtensionMap[typeof point][],
      );
    },
  };
}
