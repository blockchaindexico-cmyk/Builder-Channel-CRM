import { ChartTable } from "./chart-table";

/**
 * A conversion funnel (M10-05, M10-06, M10-16): ordered stages as horizontal bars in one hue, darker as the stage
 * advances, with the share of the first stage and the step conversion from the previous one.
 */
export function Funnel({
  title,
  steps,
}: {
  title: string;
  steps: { key: string; label: string; value: number }[];
}) {
  const first = steps[0]?.value ?? 0;
  const pct = (part: number, whole: number) =>
    whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "—";
  return (
    <figure aria-label={title}>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className="grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-3 text-sm"
          >
            <span className="truncate">{step.label}</span>
            <span className="h-4 min-w-0">
              <span
                className="block h-4 rounded-r"
                style={{
                  width: `${first ? Math.max((step.value / first) * 100, step.value ? 1 : 0) : 0}%`,
                  background: `var(--viz-seq-${Math.min(index + 1, 5)})`,
                }}
              />
            </span>
            <span className="w-28 text-right text-xs tabular-nums">
              <span className="font-medium">{step.value.toLocaleString("en-IN")}</span>
              <span className="text-muted-foreground">
                {" "}
                · {index === 0 ? "100%" : pct(step.value, steps[index - 1]!.value)}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">
        Percentages are conversion from the stage before.
      </p>
      <ChartTable
        caption={title}
        headers={["Stage", "Leads", "From previous", "From start"]}
        rows={steps.map((step, index) => [
          step.label,
          step.value.toLocaleString("en-IN"),
          index ? pct(step.value, steps[index - 1]!.value) : "—",
          pct(step.value, first),
        ])}
      />
    </figure>
  );
}
