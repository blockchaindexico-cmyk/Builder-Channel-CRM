function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.map(formatValue).join(", ");
  return JSON.stringify(value);
}

function humanize(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._]/g, " ")
    .replace(/^./, (first) => first.toUpperCase());
}

/** Before/after table for an audit entry's `changes` (M02-18). */
export function AuditChanges({
  changes,
}: {
  changes: Record<string, { from: unknown; to: unknown }>;
}) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-md border text-sm">
      <table className="w-full table-fixed">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="w-1/3 px-3 py-2 text-left font-medium">Field</th>
            <th className="px-3 py-2 text-left font-medium">Before</th>
            <th className="px-3 py-2 text-left font-medium">After</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([field, change]) => (
            <tr key={field} className="border-t align-top">
              <td className="px-3 py-2 font-medium break-words">{humanize(field)}</td>
              <td className="px-3 py-2 break-words text-muted-foreground line-through decoration-muted-foreground/40">
                {formatValue(change.from)}
              </td>
              <td className="px-3 py-2 break-words">{formatValue(change.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
