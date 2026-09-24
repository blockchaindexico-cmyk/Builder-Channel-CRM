"use client";

import { useFormatters } from "./regional-settings";

/**
 * "5 minutes ago" with the full date and time on hover. Server and browser render at slightly different
 * moments, so the text may differ by a few seconds; the hydration warning for this element is suppressed.
 */
export function RelativeTime({ value, className }: { value: string | Date; className?: string }) {
  const format = useFormatters();
  const iso = typeof value === "string" ? value : value.toISOString();
  return (
    <time
      dateTime={iso}
      title={format.dateTime(iso)}
      className={className}
      suppressHydrationWarning
    >
      {format.relative(iso)}
    </time>
  );
}
