export type FieldChange = { from: unknown; to: unknown };
export type ChangeSet = Record<string, FieldChange>;

/** Fields never shown in audit diffs. */
const ALWAYS_IGNORED = new Set(["updatedAt", "createdAt"]);
/** Field names whose values are replaced with "[redacted]". */
const SENSITIVE = /(password|secret|token|hash|apikey|api_key)/i;

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (
    value !== null &&
    typeof value === "object" &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
  ) {
    // Prisma Decimal and similar value objects.
    return (value as { toJSON: () => unknown }).toJSON();
  }
  return value;
}

function isEqual(a: unknown, b: unknown): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (left === right) return true;
  if (typeof left === "object" || typeof right === "object") {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
}

/**
 * Shallow field-level diff between two versions of a record, suitable for the audit log (PRD §28:
 * "previous values/history should remain available").
 */
export function diffRecords(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  options: { only?: readonly string[]; ignore?: readonly string[] } = {},
): ChangeSet {
  const changes: ChangeSet = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    if (ALWAYS_IGNORED.has(key) || options.ignore?.includes(key)) continue;
    if (options.only && !options.only.includes(key)) continue;
    const from = before?.[key];
    const to = after?.[key];
    if (isEqual(from, to)) continue;
    changes[key] = SENSITIVE.test(key)
      ? { from: "[redacted]", to: "[redacted]" }
      : { from: normalize(from), to: normalize(to) };
  }
  return changes;
}

export function hasChanges(changes: ChangeSet): boolean {
  return Object.keys(changes).length > 0;
}
